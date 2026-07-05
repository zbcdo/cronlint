import type { Diagnostic, Field, ParsedCron, ParsedField, Term } from "./types.js";
import { docsUrl } from "./types.js";

const SHORTCUTS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

export const FIELD_BOUNDS: Record<Field, { min: number; max: number }> = {
  second: { min: 0, max: 59 },
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 7 }, // 7 accepted, normalized to 0
};

const MONTH_NAMES: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const DOW_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const UNSUPPORTED_TOKEN_DIALECTS: Record<string, string> = {
  L: "Quartz, AWS EventBridge, and some cron implementations",
  W: "Quartz and AWS EventBridge",
  "#": "Quartz and AWS EventBridge",
  "?": "Quartz and AWS EventBridge",
};

const FIELDS_5: Field[] = ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"];
const FIELDS_6: Field[] = ["second", ...FIELDS_5];

// How each field is called in messages shown to users.
const LABEL: Record<Field, string> = {
  second: "seconds",
  minute: "minute",
  hour: "hour",
  dayOfMonth: "day-of-month",
  month: "month",
  dayOfWeek: "day-of-week",
};

// Extra hint for fields that also accept names.
const NAME_HINT: Partial<Record<Field, string>> = {
  month: " or a month name like JAN",
  dayOfWeek: " or a day name like MON",
};

function syntaxError(message: string, field?: Field, span?: [number, number]): Diagnostic {
  const d: Diagnostic = {
    rule: "syntax",
    severity: "error",
    message,
    docs: docsUrl("syntax"),
  };
  if (field) {
    d.field = field;
  }

  if (span) {
    d.span = span;
  }

  return d;
}

function unsupportedToken(token: string, field: Field, span: [number, number]): Diagnostic {
  return {
    rule: "unsupported-token",
    severity: "error",
    message:
      `'${token}' is not part of standard cron — it comes from ${
        UNSUPPORTED_TOKEN_DIALECTS[token] ?? "other schedulers"
      }, and most cron programs will reject this entry. ` +
      `Rewrite the schedule without it, or run it on a scheduler that supports it.`,
    field,
    span,
    docs: docsUrl("unsupported-token"),
  };
}

/** Resolve a name or integer literal to a number, or null if not a number/name. */
function resolveValue(tok: string, field: Field): number | null {
  if (/^\d+$/.test(tok)) {
    return parseInt(tok, 10);
  }

  const upper = tok.toUpperCase();
  if (field === "month" && upper in MONTH_NAMES) {
    return MONTH_NAMES[upper]!;
  }

  if (field === "dayOfWeek" && upper in DOW_NAMES) {
    return DOW_NAMES[upper]!;
  }

  return null;
}

// Day-of-week 7 means Sunday, the same day as 0. Single values are stored
// as 0 so every rule sees one number for Sunday, while `raw` on the Term
// keeps the "7" the user typed — the dow-sunday-7 rule reports based on
// what was written, not on the stored number. Range endpoints are NOT
// mapped here: `5-7` must keep from=5, to=7, or it would look like a
// backwards range (5 to 0) and be wrongly reported by range-wrap. The
// resolver maps 7 to 0 after a range is expanded to its values.
function normalize(n: number, field: Field): number {
  return field === "dayOfWeek" && n === 7 ? 0 : n;
}

interface TermParse {
  term?: Term;
  diagnostics: Diagnostic[];
}

// Parse one comma-separated piece of a field ("5", "1-10", "*/15", ...).
//
// `offset` is where this piece starts inside the whole input string. Every
// diagnostic carries a [start, end) character range built from it, so an
// editor or the CLI can point at the exact characters that are wrong
// rather than the whole expression.
function parseTerm(tok: string, field: Field, offset: number): TermParse {
  const span: [number, number] = [offset, offset + tok.length];
  const { min, max } = FIELD_BOUNDS[field];
  const label = LABEL[field];

  const badName = (bad: string) =>
    `'${bad}' is not something the ${label} field accepts — expected a number between ${min} and ${max}${NAME_HINT[field] ?? ""}.`;
  const outOfRange = (bad: number) =>
    `Expected a value between ${min} and ${max} in the ${label} field, got ${bad}.`;

  // L, W, # and ? belong to other schedulers (Quartz, AWS EventBridge).
  // They are recognized on purpose so the diagnostic can name where they
  // DO work, instead of a generic "invalid character" message.
  for (const special of ["L", "W", "#", "?"]) {
    if (tok.toUpperCase().includes(special)) {
      return { diagnostics: [unsupportedToken(special, field, span)] };
    }
  }

  if (tok === "") {
    return {
      diagnostics: [
        syntaxError(
          `There is an empty spot in the ${label} field — usually a stray or doubled comma, as in '1,,2'. Remove the extra comma.`,
          field,
          span,
        ),
      ],
    };
  }

  // A step is the part after "/": in "*/15" the base is "*" and the step
  // is 15, meaning "every 15th value of whatever the base selects". The
  // base can be a star ("*/15"), a range ("10-40/15"), or a single value
  // ("10/15", which classic cron reads as "from 10 to the end of the
  // field, every 15th"). Only the shape is checked here; whether the step
  // size makes sense for the field is the step-invalid rule's decision.
  let base = tok;
  let stepPart: string | undefined;
  const slash = tok.indexOf("/");
  if (slash !== -1) {
    base = tok.slice(0, slash);
    stepPart = tok.slice(slash + 1);
    if (stepPart.includes("/")) {
      return {
        diagnostics: [
          syntaxError(
            `'${tok}' in the ${label} field has more than one '/', but a step can be written only once, like '*/5'. Remove the extra '/'.`,
            field,
            span,
          ),
        ],
      };
    }
  }

  let step: number | undefined;
  if (stepPart !== undefined) {
    if (!/^\d+$/.test(stepPart)) {
      return {
        diagnostics: [
          syntaxError(
            `The step after '/' must be a whole number, but the ${label} field has '${stepPart}'. Write it like '*/5'.`,
            field,
            span,
          ),
        ],
      };
    }

    step = parseInt(stepPart, 10);
  }

  // Base: star
  if (base === "*") {
    if (step !== undefined) {
      return { term: { kind: "step", step, raw: tok }, diagnostics: [] };
    }

    return { term: { kind: "star", raw: tok }, diagnostics: [] };
  }

  // Base: range a-b
  const dash = base.indexOf("-");
  if (dash > 0) {
    const fromTok = base.slice(0, dash);
    const toTok = base.slice(dash + 1);
    const from = resolveValue(fromTok, field);
    const to = resolveValue(toTok, field);
    if (from === null || to === null) {
      const bad = from === null ? fromTok : toTok;

      return { diagnostics: [syntaxError(badName(bad), field, span)] };
    }

    if (from < min || from > max || to < min || to > max) {
      const bad = from < min || from > max ? from : to;

      return { diagnostics: [syntaxError(outOfRange(bad), field, span)] };
    }

    // Range endpoints keep their written values (see normalize above for
    // why day-of-week 7 is not mapped to 0 here).
    const term: Term = {
      kind: step !== undefined ? "step" : "range",
      from,
      to,
      raw: tok,
    };
    if (step !== undefined) {
      term.step = step;
    }

    return { term, diagnostics: [] };
  }

  // Base: single value (a or a/n)
  const value = resolveValue(base, field);
  if (value === null) {
    return { diagnostics: [syntaxError(badName(base), field, span)] };
  }

  if (value < min || value > max) {
    return { diagnostics: [syntaxError(outOfRange(value), field, span)] };
  }

  if (step !== undefined) {
    // "10/15": the value is the starting point and the range runs to the
    // end of the field, matching what classic Unix cron does.
    return {
      term: { kind: "step", from: value, step, raw: tok },
      diagnostics: [],
    };
  }

  return {
    term: { kind: "value", value: normalize(value, field), raw: tok },
    diagnostics: [],
  };
}

function parseField(
  raw: string,
  field: Field,
  offset: number,
): { parsed: ParsedField; diagnostics: Diagnostic[] } {
  const terms: Term[] = [];
  const diagnostics: Diagnostic[] = [];
  let cursor = offset;
  for (const tok of raw.split(",")) {
    const result = parseTerm(tok, field, cursor);
    if (result.term) {
      terms.push(result.term);
    }

    diagnostics.push(...result.diagnostics);
    // Advance past this piece plus the comma that followed it, keeping
    // `cursor` pointed at the first character of the next piece.
    cursor += tok.length + 1;
  }

  const restricted = !(terms.length === 1 && terms[0]!.kind === "star");

  return { parsed: { field, terms, raw, restricted }, diagnostics };
}

/** What {@link parse} returns: the parsed expression (when valid) and any parse errors. */
export interface ParseResult {
  /** The parsed expression; absent when the input has errors. */
  cron?: ParsedCron;
  /** Parse errors; empty when the input is valid. */
  diagnostics: Diagnostic[];
}

/**
 * Parse a cron expression into its structured form without running any
 * lint rules.
 *
 * Accepts five-field standard cron, six-field (leading seconds), and the
 * `@` shortcuts. Errors come back as diagnostics with character positions
 * pointing at the offending part of the input — this function does not
 * throw.
 */
export function parse(expr: string): ParseResult {
  const raw = expr;
  const trimmed = expr.trim();

  if (trimmed === "") {
    return {
      diagnostics: [
        syntaxError(
          "The expression is empty. Write five fields separated by spaces, like '*/5 * * * *'.",
        ),
      ],
    };
  }

  // Inputs starting with "@" are shortcuts (@daily, @hourly, ...). They
  // are swapped for their five-field form so the rest of the parser and
  // all rules see ordinary fields; the original spelling is kept on
  // ParsedCron.shortcut for the nonportable-shortcut rule to report.
  let working = trimmed;
  let shortcut: string | undefined;
  if (trimmed.startsWith("@")) {
    const lower = trimmed.toLowerCase();
    if (lower === "@reboot") {
      // "@reboot" means "once at startup" and has no five-field form, so
      // it parses to a cron with no fields; only the nonportable-shortcut
      // rule has anything to say about it.
      return {
        cron: { dialect: "standard5", fields: [], raw, shortcut: "@reboot" },
        diagnostics: [],
      };
    }

    const expansion = SHORTCUTS[lower];
    if (!expansion) {
      const start = raw.indexOf(trimmed);

      return {
        diagnostics: [
          syntaxError(
            `'${trimmed}' is not a shortcut cron recognizes. The supported shortcuts are @yearly, @annually, @monthly, @weekly, @daily, @midnight, @hourly and @reboot.`,
            undefined,
            [start, start + trimmed.length],
          ),
        ],
      };
    }

    shortcut = trimmed;
    working = expansion;
  }

  // Split on runs of spaces, remembering where each piece starts so
  // diagnostics can point at exact character positions. For a shortcut the
  // positions refer to the expanded form ("0 0 * * *"), since the original
  // input has no fields to point into.
  const source = shortcut ? working : raw;
  const tokens: { text: string; start: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    tokens.push({ text: m[0], start: m.index });
  }

  // The number of pieces decides the format: five fields is standard cron
  // (minute first), six fields means a leading seconds field. There is no
  // other signal — a 6-field line is never "5 fields plus junk".
  let fieldNames: Field[];
  let dialect: ParsedCron["dialect"];
  if (tokens.length === 5) {
    fieldNames = FIELDS_5;
    dialect = "standard5";
  } else if (tokens.length === 6) {
    fieldNames = FIELDS_6;
    dialect = "withSeconds6";
  } else {
    return {
      diagnostics: [
        syntaxError(
          `Expected 5 fields (minute, hour, day-of-month, month, day-of-week) or 6 (seconds first), but found ${tokens.length}. Separate fields with spaces.`,
          undefined,
          [0, raw.length],
        ),
      ],
    };
  }

  const fields: ParsedField[] = [];
  const diagnostics: Diagnostic[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const { parsed, diagnostics: fieldDiags } = parseField(tok.text, fieldNames[i]!, tok.start);
    fields.push(parsed);
    diagnostics.push(...fieldDiags);
  }

  if (diagnostics.some((d) => d.severity === "error")) {
    return { diagnostics };
  }

  const cron: ParsedCron = { dialect, fields, raw };
  if (shortcut) {
    cron.shortcut = shortcut;
  }

  return { cron, diagnostics };
}
