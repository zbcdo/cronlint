import type { Field, ParsedCron, ParsedField, Term } from "./types.js";
import { FIELD_BOUNDS } from "./parse.js";

/** Concrete values a single term selects within the field's bounds. */
export function resolveTerm(term: Term, field: Field): number[] {
  const values = resolveTermRaw(term, field);
  if (field !== "dayOfWeek") {
    return values;
  }

  // Day-of-week range endpoints keep the written 7 (Sunday) so range
  // direction stays meaningful; once expanded to plain values, 7 becomes 0.
  return [...new Set(values.map((v) => (v === 7 ? 0 : v)))];
}

function resolveTermRaw(term: Term, field: Field): number[] {
  const { min, max } = FIELD_BOUNDS[field];
  const hi = max;

  switch (term.kind) {
    case "star": {
      return seq(min, hi, 1);
    }

    case "value": {
      return [term.value!];
    }

    case "range": {
      const { from, to } = term as { from: number; to: number };
      if (from <= to) {
        return seq(from, to, 1);
      }

      // wrapped range: from..hi then min..to
      return [...seq(from, hi, 1), ...seq(min, to, 1)];
    }

    case "step": {
      const step = term.step!;
      if (step <= 0) {
        return [];
      }

      const from = term.from ?? min;
      const to = term.to ?? hi;
      if (from <= to) {
        return seq(from, to, step);
      }

      return dedupe([...seq(from, hi, step), ...seq(min, to, step)]);
    }
  }
}

function seq(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) {
    out.push(v);
  }

  return out;
}

function dedupe(vals: number[]): number[] {
  return [...new Set(vals)];
}

/**
 * Expand a parsed field into the concrete values it selects, sorted
 * ascending with duplicates removed.
 *
 * A `*` gives the field's full range, ranges and steps are expanded, and
 * backwards ranges wrap around the end of the field. Day-of-week 7
 * (Sunday) comes back as 0, so callers see one number per weekday.
 * A step of 0 or less selects nothing.
 *
 * ```ts
 * const { cron } = parse("0-45/15 8-10 * * 5-7");
 * resolveField(cron!.fields[0]!); // [0, 15, 30, 45]
 * resolveField(cron!.fields[4]!); // [0, 5, 6]  — Friday to Sunday
 * ```
 */
export function resolveField(pf: ParsedField): number[] {
  const all = pf.terms.flatMap((t) => resolveTerm(t, pf.field));

  return dedupe(all).sort((a, b) => a - b);
}

export function getField(cron: ParsedCron, field: Field): ParsedField | undefined {
  return cron.fields.find((f) => f.field === field);
}

/** Max day number that exists in a given month; Feb capped at 29 (leap years are real). */
export const MONTH_MAX_DAY: Record<number, number> = {
  1: 31,
  2: 29,
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

/** Span (max - min + 1) of the field's full domain, for step validity. */
export function fieldSpan(field: Field): number {
  const { min, max } = FIELD_BOUNDS[field];
  const hi = field === "dayOfWeek" ? 6 : max;

  return hi - min + 1;
}
