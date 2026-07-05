import type { Diagnostic, Field, ParsedCron, ParsedField } from "../types.js";
import { docsUrl } from "../types.js";

export function finding(
  rule: string,
  severity: Diagnostic["severity"],
  message: string,
  field?: Field,
  span?: [number, number],
): Diagnostic {
  const d: Diagnostic = { rule, severity, message, docs: docsUrl(rule) };
  if (field) {
    d.field = field;
  }

  if (span) {
    d.span = span;
  }

  return d;
}

/**
 * Span of a field's raw text within the original input. Undefined for
 * @shortcut inputs (fields exist only in the expansion).
 */
export function fieldSpan(cron: ParsedCron, field: Field): [number, number] | undefined {
  if (cron.shortcut) {
    return undefined;
  }

  const index = cron.fields.findIndex((f) => f.field === field);
  if (index === -1) {
    return undefined;
  }

  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(cron.raw)) !== null) {
    if (i === index) {
      return [m.index, m.index + m[0].length];
    }

    i++;
  }

  return undefined;
}

export function get(cron: ParsedCron, field: Field): ParsedField | undefined {
  return cron.fields.find((f) => f.field === field);
}

import { fieldSpan as domainSpan } from "../resolve.js";

/** True when any term has a step that step-invalid will reject. */
export function hasInvalidStep(cron: ParsedCron): boolean {
  return cron.fields.some((pf) =>
    pf.terms.some((t) => t.kind === "step" && (t.step! <= 0 || t.step! > domainSpan(pf.field))),
  );
}

/** Month lengths in a common (non-leap) year. */
export const COMMON_YEAR_MAX: Record<number, number> = {
  1: 31,
  2: 28,
  3: 31,
  4: 30,
  5: 31,
  6: 30,
  7: 31,
  8: 31,
  9: 30,
  10: 31,
  11: 30,
  12: 31,
};

export const MONTH_NAMES_EN = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const DAY_NAMES_EN = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** How a field is called in messages shown to users. */
export const FIELD_LABEL: Record<Field, string> = {
  second: "seconds",
  minute: "minute",
  hour: "hour",
  dayOfMonth: "day-of-month",
  month: "month",
  dayOfWeek: "day-of-week",
};

/** 1 → "1st", 22 → "22nd", and so on. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) {
    return `${n}th`;
  }

  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";

  return `${n}${suffix}`;
}

/** ["a", "b", "c"] → "a, b and c". */
export function listWords(items: string[], conjunction = "and"): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`;
}

/** True when the values step by one with no gaps, e.g. [1,2,3,4]. */
function contiguous(values: number[]): boolean {
  return values.every((v, i) => i === 0 || v === values[i - 1]! + 1);
}

/** Sorted day numbers → "the 1st through the 7th" or "the 1st, 8th and 15th". */
export function describeDays(values: number[], cap = 6): string {
  if (values.length >= 3 && contiguous(values)) {
    return `the ${ordinal(values[0]!)} through the ${ordinal(values.at(-1)!)}`;
  }

  if (values.length > cap) {
    return `the ${values.slice(0, cap).map(ordinal).join(", ")} and so on`;
  }

  return `the ${listWords(values.map(ordinal))}`;
}

/** Sorted weekday numbers (0–6) → "every Monday" or "every Saturday and Sunday". */
export function describeWeekdays(values: number[]): string {
  const names = values.map((v) => DAY_NAMES_EN[v]!);
  if (values.length >= 3 && contiguous(values)) {
    return `every ${names[0]} through ${names.at(-1)}`;
  }

  return `every ${listWords(names)}`;
}

/** Sorted month numbers → "January, June and November". */
export function describeMonths(values: number[]): string {
  return listWords(values.map((v) => MONTH_NAMES_EN[v]!));
}

/** 5 → "05", for clock times in messages. */
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
