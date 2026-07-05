// dow-sunday-7 — Sunday written as 7 instead of 0.
//
// Most cron programs accept both 0 and 7 for Sunday, so `0 0 * * 7`
// works fine on the machine where it was written. The problem appears
// when the same line is copied somewhere stricter — some schedulers only
// accept 0–6 and reject the whole entry. People assume a cron line that
// works in one place works everywhere; day-of-week numbering is one of
// the places where that is not true.
//
// Wrong:  0 0 * * 7     (rejected by some cron programs)
// Right:  0 0 * * 0     (or SUN — accepted everywhere)

import type { Rule } from "../types.js";
import { fieldSpan, finding, get } from "./util.js";

export const dowSunday7: Rule = (cron) => {
  const dow = get(cron, "dayOfWeek");
  if (!dow) {
    return [];
  }

  // Look for '7' written as a value or range endpoint. The text after '/'
  // is a step size, where 7 means something else entirely, so only the
  // part before any '/' is checked.
  const uses7 = dow.terms.some((t) => {
    const base = t.raw.split("/")[0]!;

    return /(^|-)7(-|$)/.test(base);
  });
  if (!uses7) {
    return [];
  }

  return [
    finding(
      "dow-sunday-7",
      "info",
      `Some cron programs do not accept 7 for Sunday and will reject this entry. Write Sunday as '0' or 'SUN', which every implementation accepts.`,
      "dayOfWeek",
      fieldSpan(cron, "dayOfWeek"),
    ),
  ];
};
