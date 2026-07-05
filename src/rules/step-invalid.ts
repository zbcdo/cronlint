// step-invalid — a step size that cannot work in its field.
//
// A step like `*/15` in the minute field means "every 15 minutes". The
// minute field only holds 60 values, so a step larger than 60 can never
// take a second step: `*/90` does not mean "every 90 minutes" — it fires
// once at minute 0 of every hour, i.e. hourly. People write `*/90`
// expecting a run every hour and a half and get one every hour instead.
// Cron itself accepts the value without complaint. A step of 0 is
// equally meaningless and is reported the same way.
//
// Wrong:  */90 * * * *   (fires every hour, not every 90 minutes)
// Right:  0,30 0-23/3 * * *  or two entries — cron cannot express a
//         90-minute interval in a single step

import type { Field, Rule } from "../types.js";
import { fieldSpan as domainSpan } from "../resolve.js";
import { FIELD_LABEL, fieldSpan, finding } from "./util.js";

// What one step counts in each field, and when the field starts over.
export const STEP_UNIT: Record<Field, string> = {
  second: "seconds",
  minute: "minutes",
  hour: "hours",
  dayOfMonth: "days",
  month: "months",
  dayOfWeek: "days",
};

export const WRAP_PERIOD: Record<Field, string> = {
  second: "minute",
  minute: "hour",
  hour: "day",
  dayOfMonth: "month",
  month: "year",
  dayOfWeek: "week",
};

export const stepInvalid: Rule = (cron) => {
  const out = [];
  for (const pf of cron.fields) {
    for (const term of pf.terms) {
      if (term.kind !== "step") {
        continue;
      }

      const step = term.step!;
      const span = domainSpan(pf.field);
      if (step <= 0) {
        out.push(
          finding(
            "step-invalid",
            "error",
            `A step of 0 does not mean anything: '${term.raw}' cannot move forward, so the schedule is broken. Use a step of 1 or more, like '*/5'.`,
            pf.field,
            fieldSpan(cron, pf.field),
          ),
        );
      } else if (step > span) {
        out.push(
          finding(
            "step-invalid",
            "error",
            `This job will NOT run every ${step} ${STEP_UNIT[pf.field]}: the ${FIELD_LABEL[pf.field]} field starts over every ${WRAP_PERIOD[pf.field]}, so '${term.raw}' only ever lands on its first value and the job runs once per ${WRAP_PERIOD[pf.field]}. Put an interval this long in a larger field instead.`,
            pf.field,
            fieldSpan(cron, pf.field),
          ),
        );
      }
    }
  }

  return out;
};
