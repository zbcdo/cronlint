// step-uneven — the step size does not divide the field evenly.
//
// A step does not remember anything between cycles: `*/7` in the
// day-of-month field means "every 7th value counting from 1", so it
// fires on the 1st, 8th, 15th, 22nd, and 29th — and then starts over at
// 1 when the next month begins. People expect "every 7 days" and instead
// get a 2- or 3-day gap at every month boundary. The same reset happens
// in any field the step does not divide evenly: `*/7` in minutes fires
// at :56 and then again at :00, only 4 minutes later.
//
// Wrong:  0 0 */7 * *   (gap shrinks at each month boundary)
// Right:  0 0 * * 1     (every Monday — a true 7-day interval)

import type { Rule, Term, Field } from "../types.js";
import { FIELD_BOUNDS } from "../parse.js";
import { fieldSpan as domainSpan, resolveTerm } from "../resolve.js";
import { STEP_UNIT, WRAP_PERIOD } from "./step-invalid.js";
import { DAY_NAMES_EN, MONTH_NAMES_EN, fieldSpan, finding, listWords, ordinal } from "./util.js";

// "on the 1st, 8th and 15th" / "on Sunday and Tuesday" / "at minutes 0, 7
// and 14" — the concrete days or times the step actually lands on, capped
// so long lists stay readable.
function describeFiring(field: Field, values: number[]): string {
  const cap = 8;
  const shown = values.slice(0, cap);
  const more = values.length > cap;
  let parts: string[];
  let prefix: string;
  switch (field) {
    case "dayOfMonth":
      prefix = "on ";
      parts = shown.map(ordinal);
      break;
    case "dayOfWeek":
      prefix = "on ";
      parts = shown.map((v) => DAY_NAMES_EN[v]!);
      break;
    case "month":
      prefix = "in ";
      parts = shown.map((v) => MONTH_NAMES_EN[v]!);
      break;
    default:
      prefix = `at ${STEP_UNIT[field]} `;
      parts = shown.map(String);
  }

  const list = more ? `${parts.join(", ")} and so on` : listWords(parts);

  return field === "dayOfMonth" ? `${prefix}the ${list}` : `${prefix}${list}`;
}

// How many values the step counts through before its field starts over:
// the whole field for `*/n`, from the start value to the field's end for
// `a/n`, and the written range for `a-b/n` (both segments when the range
// wraps around the field's end).
function baseSpan(term: Term, field: Field): number {
  const { min } = FIELD_BOUNDS[field];
  const hi = field === "dayOfWeek" ? 6 : FIELD_BOUNDS[field].max;
  if (term.from === undefined) {
    return domainSpan(field);
  }

  if (term.to === undefined) {
    return hi - term.from + 1;
  }

  if (term.from <= term.to) {
    return term.to - term.from + 1;
  }

  return hi - term.from + 1 + (term.to - min + 1);
}

export const stepUneven: Rule = (cron) => {
  const out = [];
  for (const pf of cron.fields) {
    for (const term of pf.terms) {
      if (term.kind !== "step") {
        continue;
      }

      // Steps that cannot work at all are step-invalid's report, not ours.
      const step = term.step!;
      if (step <= 0 || step > domainSpan(pf.field)) {
        continue;
      }

      const span = baseSpan(term, pf.field);
      if (span % step === 0) {
        continue;
      }

      const values = resolveTerm(term, pf.field);
      let message = `This does not run evenly every ${step} ${STEP_UNIT[pf.field]}: it runs ${describeFiring(pf.field, values)}, then starts over when the ${WRAP_PERIOD[pf.field]} ends, so the last gap is shorter than the others.`;
      if (pf.field === "dayOfMonth" && step === 7) {
        message += ` If you wanted weekly, schedule a weekday instead ('0 0 * * 1' runs every Monday).`;
      }

      out.push(finding("step-uneven", "info", message, pf.field, fieldSpan(cron, pf.field)));
    }
  }

  return out;
};
