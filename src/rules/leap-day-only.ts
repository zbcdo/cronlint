// leap-day-only — the schedule is February 29, and nothing else.
//
// February 29 exists only in leap years, so `0 0 29 2 *` runs roughly
// once every four years. That can be exactly what someone wants, but it
// also appears by accident — for example when a "last day of February"
// job is written with 29 instead of 28. Cron gives no hint either way,
// so this rule asks the author to confirm.
//
// Wrong:  0 0 29 2 *    (if you meant every February: runs only in leap years)
// Right:  0 0 28 2 *    (a date every February has)

import type { Rule } from "../types.js";
import { resolveField } from "../resolve.js";
import { fieldSpan, finding, get } from "./util.js";

export const leapDayOnly: Rule = (cron) => {
  const dom = get(cron, "dayOfMonth");
  const month = get(cron, "month");
  const dow = get(cron, "dayOfWeek");
  if (!dom?.restricted || !month?.restricted) {
    return [];
  }

  // When day-of-week is also set, cron runs on days matching either field,
  // so the schedule is no longer limited to February 29.
  if (dow?.restricted) {
    return [];
  }

  const domVals = resolveField(dom);
  const monthVals = resolveField(month);
  if (domVals.length === 1 && domVals[0] === 29 && monthVals.length === 1 && monthVals[0] === 2) {
    return [
      finding(
        "leap-day-only",
        "info",
        "This job runs only on February 29th, a date that exists just once every four years. If you meant every February, use the 28th instead; if you really meant leap day, keep it as is.",
        "dayOfMonth",
        fieldSpan(cron, "dayOfMonth"),
      ),
    ];
  }

  return [];
};
