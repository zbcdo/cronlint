// dom-dow-both — day-of-month and day-of-week are both restricted.
//
// When both fields are set, a day only has to appear in one of them for
// the job to run — cron does not require both to agree. People write
// `0 0 1-7 * 1` expecting "the first Monday of the month" (a day that is
// in the 1st–7th and also a Monday), but cron reads it as "every day from
// the 1st to the 7th, plus every Monday" — up to eleven runs a month
// instead of one.
//
// Wrong:  0 0 1-7 * 1     (runs on days 1–7 AND every Monday)
// Right:  0 0 * * 1       (every Monday; add a date check inside the job
//                          if you only want the first one of the month)

import type { Rule } from "../types.js";
import { resolveField } from "../resolve.js";
import { DAY_NAMES_EN, describeDays, describeWeekdays, fieldSpan, finding, get } from "./util.js";

export const domDowBoth: Rule = (cron) => {
  const dom = get(cron, "dayOfMonth");
  const dow = get(cron, "dayOfWeek");
  if (!dom?.restricted || !dow?.restricted) {
    return [];
  }

  const domVals = resolveField(dom);
  const dowVals = resolveField(dow);

  let message: string;
  if (domVals.length > 0 && dowVals.length > 0) {
    // Days per year: the month-days appear 12 times, each weekday about 52
    // times, minus the days counted twice because they land on both.
    const perYear = Math.round(
      domVals.length * 12 + (dowVals.length * 365) / 7 - (domVals.length * 12 * dowVals.length) / 7,
    );
    message =
      `This job runs on ${describeDays(domVals)} of every month, and also on ${describeWeekdays(dowVals)} — about ${perYear} days a year, two schedules in one. ` +
      `Cron treats the two day fields as separate schedules; a day only has to appear in one of them for the job to run.`;
  } else {
    message =
      `This job runs on the days picked by '${dom.raw}' and also on the weekdays picked by '${dow.raw}' — two schedules in one. ` +
      `Cron treats the two day fields as separate schedules; a day only has to appear in one of them for the job to run.`;
  }

  if (domVals.length > 0 && domVals.every((d) => d >= 1 && d <= 7) && dowVals.length === 1) {
    const day = DAY_NAMES_EN[dowVals[0]!];
    const fixed = cron.fields.map((f) => (f.field === "dayOfMonth" ? "*" : f.raw)).join(" ");
    message += ` If you meant the first ${day} of the month, use '${fixed}' and have the job stop when the date is past the 7th.`;
  }

  return [finding("dom-dow-both", "warning", message, "dayOfMonth", fieldSpan(cron, "dayOfMonth"))];
};
