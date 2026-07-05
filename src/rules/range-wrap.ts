// range-wrap — a range whose start is bigger than its end.
//
// A range like `FRI-MON` or hours `22-2` reads naturally as "Friday
// through Monday" or "10 PM through 2 AM". Cron implementations do not
// agree on what it means: the classic Unix cron rejects the entry or
// reads it wrong, while some newer ones wrap around the end of the field
// the way the author hoped. The same line can therefore schedule
// different runs on different machines, or fail to install at all.
//
// Wrong:  0 0 * * FRI-MON      (meaning differs between cron programs)
// Right:  0 0 * * FRI,SAT,SUN,MON  (explicit list — same result everywhere)

import type { Field, Rule, Term } from "../types.js";
import { FIELD_BOUNDS } from "../parse.js";
import { resolveTerm } from "../resolve.js";
import { DAY_NAMES_EN, MONTH_NAMES_EN, fieldSpan, finding } from "./util.js";

const DOW_ABBR = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const MONTH_ABBR = [
  "",
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

// The endpoint as a person would say it: "Friday", "November", or the number.
function endpointName(field: Field, value: number): string {
  if (field === "dayOfWeek") {
    return DAY_NAMES_EN[value % 7]!;
  }

  if (field === "month") {
    return MONTH_NAMES_EN[value]!;
  }

  return String(value);
}

// A spelled-out replacement that runs on the same days everywhere: a list
// of names for day-of-week and month, or the two straight ranges for
// numeric fields ("22-2" → "22-23,0-2").
function portableForm(field: Field, term: Term): string {
  if (field === "dayOfWeek") {
    return resolveTerm(term, field)
      .map((v) => DOW_ABBR[v]!)
      .join(",");
  }

  if (field === "month") {
    return resolveTerm(term, field)
      .map((v) => MONTH_ABBR[v]!)
      .join(",");
  }

  const { min, max } = FIELD_BOUNDS[field];
  if (term.step !== undefined) {
    // With a step involved, two plain ranges would change the firing
    // values, so list the exact values instead.
    return resolveTerm(term, field).join(",");
  }

  return `${term.from}-${max},${min}-${term.to}`;
}

export const rangeWrap: Rule = (cron) => {
  const out = [];
  for (const pf of cron.fields) {
    for (const term of pf.terms) {
      if (term.from === undefined || term.to === undefined) {
        continue;
      }

      if (term.from <= term.to) {
        continue;
      }

      out.push(
        finding(
          "range-wrap",
          "warning",
          `Cron programs disagree about what '${term.raw}' means, because it runs backwards — from ${endpointName(pf.field, term.from)} to ${endpointName(pf.field, term.to)}: some reject the entry, some run it on the wrong days, and some wrap around the way you probably intended. Spell it out instead: '${portableForm(pf.field, term)}'.`,
          pf.field,
          fieldSpan(cron, pf.field),
        ),
      );
    }
  }

  return out;
};
