// star-minute-restricted — a date is chosen but the time is left as `* *`.
//
// The first two cron fields are minute and hour. Leaving both as `*`
// while narrowing a date field means "every minute of every hour on
// those days": `* * 1 * *` runs 1,440 times on the 1st of each month.
// People write it believing the stars mean "any time, once" — that cron
// will pick some reasonable moment on that day. Cron has no such notion;
// a `*` means every value, so the job runs all day long.
//
// Wrong:  * * 1 * *    (1,440 runs on the 1st of each month)
// Right:  0 0 1 * *    (one run, at midnight on the 1st)

import type { Rule } from "../types.js";
import { resolveField } from "../resolve.js";
import { describeDays, describeMonths, describeWeekdays, fieldSpan, finding, get } from "./util.js";

export const starMinuteRestricted: Rule = (cron) => {
  const minute = get(cron, "minute");
  const hour = get(cron, "hour");
  if (!minute || !hour) {
    return [];
  }

  if (minute.restricted || hour.restricted) {
    return [];
  }

  const dom = get(cron, "dayOfMonth");
  const month = get(cron, "month");
  const dow = get(cron, "dayOfWeek");
  const restrictedDate = [dom, month, dow].filter((f) => f?.restricted);
  if (restrictedDate.length === 0) {
    return [];
  }

  const second = get(cron, "second");
  const everySecond = second !== undefined && !second.restricted;
  const rate = everySecond ? "86,400 times — every second" : "1,440 times — every minute";

  const phrases = restrictedDate.map((f) => {
    const values = resolveField(f!);
    if (f!.field === "dayOfMonth" && values.length > 0) {
      return `on ${describeDays(values)} of the month`;
    }

    if (f!.field === "dayOfWeek" && values.length > 0) {
      return `on ${describeWeekdays(values)}`;
    }

    if (f!.field === "month" && values.length > 0) {
      return `all day in ${describeMonths(values)}`;
    }

    return `on the days picked by '${f!.raw}'`;
  });

  // The same schedule with the open time fields pinned to midnight.
  const timeFields = ["second", "minute", "hour"];
  const midnightFix = cron.fields
    .map((f) => (timeFields.includes(f.field) && !f.restricted ? "0" : f.raw))
    .join(" ");

  return [
    finding(
      "star-minute-restricted",
      "warning",
      `This job runs ${rate} — ${phrases.join(" and ")}. A '*' in the minute and hour fields means every minute of every hour, not "any time, once". If you meant a single run at midnight, use '${midnightFix}'.`,
      "minute",
      fieldSpan(cron, "minute"),
    ),
  ];
};
