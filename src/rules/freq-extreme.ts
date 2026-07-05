// freq-extreme — the schedule runs far more, or far less, than people
// usually intend.
//
// Two opposite accidents produce this finding. Five stars (`* * * * *`)
// runs every minute — 1,440 times a day — usually written by someone who
// wanted "pick any time" and got "every time". And a fully pinned date
// like `0 0 1 1 *` runs exactly once a year, at midnight on January 1 —
// usually written by someone who wanted monthly and filled in one field
// too many. Both are valid cron; both quietly do something very
// different from what their author expected.
//
// Wrong:  * * * * *    (every minute, all day, every day)
// Right:  0 * * * *    (once an hour — or whatever interval was meant)

import type { Rule } from "../types.js";
import { resolveField } from "../resolve.js";
import {
  COMMON_YEAR_MAX,
  MONTH_NAMES_EN,
  fieldSpan,
  finding,
  get,
  hasInvalidStep,
  ordinal,
  pad2,
} from "./util.js";

export const freqExtreme: Rule = (cron) => {
  const minute = get(cron, "minute");
  const hour = get(cron, "hour");
  if (!minute || !hour) {
    return [];
  }

  // A broken step (reported by step-invalid) makes the resolved values
  // unreliable, so no frequency claim should be made on top of it.
  if (hasInvalidStep(cron)) {
    return [];
  }

  // Every minute of every hour, however it was written (stars, full
  // ranges, ...). When a date field is also narrowed, star-minute-restricted
  // is the better report, and lint() drops this one in its favor.
  if (resolveField(minute).length === 60 && resolveField(hour).length === 24) {
    const everySecond = cron.dialect === "withSeconds6" && !get(cron, "second")!.restricted;
    const hourlyFix = cron.dialect === "withSeconds6" ? "0 0 * * * *" : "0 * * * *";

    return [
      finding(
        "freq-extreme",
        "info",
        everySecond
          ? `This job runs every second — 86,400 times a day. If you meant once a minute, use '0 * * * * *'.`
          : `This job runs every minute — 1,440 times a day. If you meant once an hour, use '${hourlyFix}'.`,
        "minute",
        fieldSpan(cron, "minute"),
      ),
    ];
  }

  // Exactly once a year: one fixed instant, day exists every year.
  const second = get(cron, "second");
  const dom = get(cron, "dayOfMonth");
  const month = get(cron, "month");
  const dow = get(cron, "dayOfWeek");
  if (!dom || !month || !dow) {
    return [];
  }

  const single = (vals: number[]) => vals.length === 1;
  const minutes = resolveField(minute);
  const hours = resolveField(hour);
  const doms = resolveField(dom);
  const months = resolveField(month);
  if (
    (!second || single(resolveField(second))) &&
    single(minutes) &&
    single(hours) &&
    dom.restricted &&
    single(doms) &&
    month.restricted &&
    single(months) &&
    !dow.restricted &&
    doms[0]! <= COMMON_YEAR_MAX[months[0]!]!
  ) {
    const when = `${MONTH_NAMES_EN[months[0]!]} ${ordinal(doms[0]!)} at ${pad2(hours[0]!)}:${pad2(minutes[0]!)}`;
    const monthlyFix = cron.fields.map((f) => (f.field === "month" ? "*" : f.raw)).join(" ");

    return [
      finding(
        "freq-extreme",
        "info",
        `This job runs only once a year: ${when}. If you meant every month, use '${monthlyFix}'.`,
      ),
    ];
  }

  return [];
};
