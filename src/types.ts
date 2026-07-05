/** Name of a cron field. `second` appears only in six-field expressions. */
export type Field = "second" | "minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek";

/**
 * One comma-separated piece of a field, e.g. the `1-5` and `10` in `1-5,10`.
 *
 * Which numeric properties are set depends on `kind`:
 * - `star`: none — the piece is `*` and selects every value.
 * - `value`: `value` — a single number.
 * - `range`: `from` and `to` — the endpoints as written.
 * - `step`: `step`, plus `from`/`to` when the base is a range or a
 *   starting value (`10-40/5`, `10/5`); a step over a bare star sets
 *   only `step`.
 */
export interface Term {
  kind: "star" | "value" | "range" | "step";
  from?: number;
  to?: number;
  step?: number;
  value?: number;
  /** The exact characters this piece had in the input, unchanged. */
  raw: string;
}

/** One parsed field of the expression, with its pieces. */
export interface ParsedField {
  field: Field;
  terms: Term[];
  /** The field's text as written, e.g. `1-5,10`. */
  raw: string;
  /** True unless the field is a single `*` — that is, true when it narrows the schedule. */
  restricted: boolean;
}

/** The parsed form of a whole cron expression. */
export interface ParsedCron {
  /** `standard5` = minute-first, five fields; `withSeconds6` = a seconds field comes first. */
  dialect: "standard5" | "withSeconds6";
  /** The fields in the order they were written. */
  fields: ParsedField[];
  /** The original input string, untouched. */
  raw: string;
  /** The original `@shortcut` spelling when the input used one, e.g. `@daily`. */
  shortcut?: string;
}

/**
 * A single problem found in an expression. Parse errors and lint findings
 * share this shape, so one list can hold both.
 */
export interface Diagnostic {
  /** Rule id, e.g. `never-fires`; `syntax` for parse errors. */
  rule: string;
  /** `error` = broken or never runs · `warning` = very likely a mistake · `info` = worth knowing. */
  severity: "error" | "warning" | "info";
  /** Human-readable explanation. Wording may change between releases. */
  message: string;
  /** The field the problem is in, when it belongs to one. */
  field?: Field;
  /** Character range [start, end) into the original input, when one can be pointed at. */
  span?: [number, number];
  /** Web page explaining the rule: https://cronhelp.me/rules/<rule> */
  docs: string;
}

/** Options accepted by {@link lint}. */
export interface LintOptions {
  /**
   * IANA timezone name the schedule will run in, e.g. `Europe/Berlin`.
   * Used by the dst-ambiguous rule: zones that change their clocks get a
   * warning for times between 01:00 and 03:00, zones that never do get
   * none. Leave unset if the timezone is unknown.
   */
  timezone?: string;
}

/** A lint rule: a function from a parsed expression to zero or more findings. */
export type Rule = (cron: ParsedCron, opts: LintOptions) => Diagnostic[];

/** Documentation URL for a rule id. */
export function docsUrl(rule: string): string {
  return `https://cronhelp.me/rules/${rule}`;
}
