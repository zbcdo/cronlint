// never-fires — the chosen day does not exist in any chosen month.
//
// Cron accepts any day number from 1 to 31 in any month; it never checks
// whether that date exists. `0 0 30 2 *` (February 30th) is valid to
// every cron program, so the job installs cleanly, and then nothing ever
// happens — no run, no error, no log line. People find out weeks later
// when the backup or cleanup the job was supposed to do turns out to
// have never happened.
//
// Wrong:  0 0 30 2 *    (February has no 30th; the job never runs)
// Right:  0 0 28 2 *    (a date February actually has every year)
//
// February 29 is treated as a real day (it exists in leap years), so
// `0 0 29 2 *` is handled by leap-day-only rather than reported here.

import type { Rule } from "../types.js";
import { MONTH_MAX_DAY, resolveField } from "../resolve.js";
import {
  COMMON_YEAR_MAX,
  MONTH_NAMES_EN,
  fieldSpan,
  finding,
  get,
  listWords,
  ordinal,
} from "./util.js";

export const neverFires: Rule = (cron) => {
  const dom = get(cron, "dayOfMonth");
  const month = get(cron, "month");
  const dow = get(cron, "dayOfWeek");
  if (!dom?.restricted) {
    return [];
  }

  // When day-of-week is also set, cron runs on days matching either field,
  // so the schedule still gets runs on the matching weekdays.
  if (dow?.restricted) {
    return [];
  }

  const domVals = resolveField(dom);
  if (domVals.length === 0) {
    return [];
  }

  const months =
    month && month.restricted ? resolveField(month) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (months.length === 0) {
    return [];
  }

  // February's limit is 29 here, not 28: day 29 exists in leap years, so
  // it is rare but not impossible.
  const impossible = months.every((m) => domVals.every((d) => d > MONTH_MAX_DAY[m]!));
  if (!impossible) {
    return [];
  }

  // The largest day any chosen month actually reaches, using 28 for
  // February so the suggestion works every year.
  const highestRealDay = Math.max(...months.map((m) => COMMON_YEAR_MAX[m]!));
  const dayDesc = listWords(domVals.map(ordinal));
  const monthDesc = listWords(months.map((m) => MONTH_NAMES_EN[m]!));
  const noSuchDate =
    domVals.length === 1 && months.length === 1
      ? "a date that does not exist"
      : "dates that do not exist";

  return [
    finding(
      "never-fires",
      "error",
      `This job will never run: it is scheduled ONLY for the ${dayDesc} of ${monthDesc} — ${noSuchDate}. Cron accepts an impossible date without complaint and simply never fires it. Use a day ${months.length === 1 ? "that month" : "every listed month"} actually has, such as the ${ordinal(highestRealDay)}.`,
      "dayOfMonth",
      fieldSpan(cron, "dayOfMonth"),
    ),
  ];
};
