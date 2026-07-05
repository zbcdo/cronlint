// nonportable-shortcut — an @ shortcut that other systems may not accept.
//
// Shortcuts like @daily and @hourly are conveniences offered by some
// cron programs, not part of the five-field format itself. A line using
// one can fail to install, or be read differently, when moved to another
// scheduler (Quartz, AWS EventBridge, GitHub Actions, and others).
// @reboot is the extreme case: it means "once when the cron service
// starts", which has no five-field equivalent at all, so there is
// nothing to translate it to.
//
// Wrong:  @daily        (not accepted everywhere)
// Right:  0 0 * * *     (the same schedule, accepted everywhere)

import type { Rule } from "../types.js";
import { finding } from "./util.js";

export const nonportableShortcut: Rule = (cron) => {
  if (!cron.shortcut) {
    return [];
  }

  if (cron.shortcut.toLowerCase() === "@reboot") {
    return [
      finding(
        "nonportable-shortcut",
        "info",
        `'@reboot' works only where the local cron service supports it: it runs once when that service starts, and Quartz, AWS EventBridge, GitHub Actions and many others will reject the line. There is no five-field way to write it, so if this needs to run elsewhere, trigger the job from that system's own startup mechanism.`,
      ),
    ];
  }

  const expansion = cron.fields.map((f) => f.raw).join(" ");

  return [
    finding(
      "nonportable-shortcut",
      "info",
      `'${cron.shortcut}' is shorthand that not every scheduler accepts, and a few read shortcuts differently. If this line might be copied to another system, use the plain form '${expansion}'.`,
    ),
  ];
};
