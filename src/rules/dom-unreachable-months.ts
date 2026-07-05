// dom-unreachable-months — the chosen day numbers skip some months.
//
// Cron does not adjust for month length. If the day-of-month is 31, the
// job simply does not run in months with fewer than 31 days; cron gives
// no error and no substitute run on the 30th or the 1st. People write
// `0 0 31 * *` expecting "the last day of every month" and instead get
// seven runs a year, with February, April, June, September, and November
// silently missing.
//
// Wrong:  0 0 31 * *    (only runs in the seven 31-day months)
// Right:  0 0 1 * *     (first of the month — every month has a day 1;
//                        run at the start instead of the end)

import type { Rule } from "../types.js";
import { resolveField } from "../resolve.js";
import { COMMON_YEAR_MAX, describeMonths, fieldSpan, finding, get, ordinal } from "./util.js";

export const domUnreachableMonths: Rule = (cron) => {
  const dom = get(cron, "dayOfMonth");
  const month = get(cron, "month");
  const dow = get(cron, "dayOfWeek");
  if (!dom?.restricted) {
    return [];
  }

  // When day-of-week is also set, cron runs on days matching either field,
  // so every month still gets runs on the matching weekdays.
  if (dow?.restricted) {
    return [];
  }

  const domVals = resolveField(dom);
  if (domVals.length === 0) {
    return [];
  }

  const months =
    month && month.restricted ? resolveField(month) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // A month counts as unreachable when none of the selected days exist in
  // it in an ordinary year. February with only day 29 selected still lands
  // here: it gets a run only once every four years, which deserves the
  // same warning.
  const unreachable = months.filter((m) => domVals.every((d) => d > COMMON_YEAR_MAX[m]!));
  if (unreachable.length === 0) {
    return [];
  }

  const names = describeMonths(unreachable);
  const minDay = Math.min(...domVals);
  const single = unreachable.length === 1;
  const reason =
    unreachable.length === 1 && unreachable[0] === 2 && minDay === 29
      ? "February only has a 29th in leap years"
      : `the earliest day this schedule uses is the ${ordinal(minDay)}, and ${single ? "that month never goes" : "those months never go"} that high`;

  return [
    finding(
      "dom-unreachable-months",
      "warning",
      `This job silently skips ${names}: ${reason}. Cron does not adjust for month length — a date that does not exist simply never runs, with no error. Use a day every chosen month has (the 28th or lower always works).`,
      "dayOfMonth",
      fieldSpan(cron, "dayOfMonth"),
    ),
  ];
};
