// dst-ambiguous — a fixed time between 01:00 and 03:00.
//
// In regions with daylight saving time, the clock jumps forward one hour
// in spring and back one hour in autumn, and both jumps happen inside the
// 01:00–03:00 window. A job scheduled at, say, 02:30 local time does not
// exist on the spring day (the clock goes straight from 02:00 to 03:00)
// and exists twice on the autumn day. People assume "2:30 AM every night"
// means exactly one run per night; once a year it means zero, and once a
// year it can mean two.
//
// Wrong:  30 2 * * *   (skipped or doubled on clock-change days)
// Right:  30 4 * * *   (or run the job on a machine set to UTC)
//
// With a timezone option this is a warning when that zone changes its
// clocks, and silent when it never does. Without a timezone it is only
// a note, because the machine running the job might be set to UTC.

import type { Rule } from "../types.js";
import { resolveField } from "../resolve.js";
import { fieldSpan, finding, get, pad2 } from "./util.js";

const DST_WINDOW = new Set([1, 2, 3]);

/** UTC offset in minutes for an IANA zone at a given instant, via Intl. */
function offsetMinutes(timezone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(name);
  if (!m || !m[1]) {
    return 0;
  }

  const sign = m[1] === "-" ? -1 : 1;

  return sign * (parseInt(m[2]!, 10) * 60 + parseInt(m[3]!, 10));
}

/** true / false, or null when the zone id is not recognized. */
export function zoneObservesDst(timezone: string): boolean | null {
  // Sample four instants across a year; any offset difference means the
  // zone shifts its clock (covers both hemispheres).
  const samples = [
    Date.UTC(2025, 0, 15),
    Date.UTC(2025, 3, 15),
    Date.UTC(2025, 6, 15),
    Date.UTC(2025, 9, 15),
  ];
  try {
    const offsets = samples.map((t) => offsetMinutes(timezone, new Date(t)));

    return offsets.some((o) => o !== offsets[0]);
  } catch {
    return null;
  }
}

export const dstAmbiguous: Rule = (cron, opts) => {
  const minute = get(cron, "minute");
  const hour = get(cron, "hour");
  if (!minute || !hour) {
    return [];
  }

  // A job that runs every minute, or during every hour, is not tied to a
  // specific clock time, so a clock change cannot skip or repeat it in any
  // way the author would notice.
  if (!minute.restricted) {
    return [];
  }

  const hours = resolveField(hour);
  if (hours.length === 24) {
    return [];
  }

  const hits = hours.filter((h) => DST_WINDOW.has(h));
  if (hits.length === 0) {
    return [];
  }

  // A timezone that never changes its clocks (observes === false) has no
  // ambiguous window. An unrecognized timezone (observes === null) falls
  // back to the same cautious note as having no timezone at all.
  const tz = opts.timezone;
  const observes = tz ? zoneObservesDst(tz) : null;
  if (tz && observes === false) {
    return [];
  }

  const span = fieldSpan(cron, "hour");
  const minutes = resolveField(minute);
  const times = hits
    .slice(0, 3)
    .map((h) =>
      minutes.length === 1 ? `${pad2(h)}:${pad2(minutes[0]!)}` : `${pad2(h)}:00–${pad2(h)}:59`,
    )
    .join(", ");
  const timeDesc = hits.length > 3 ? `${times} and later` : times;

  if (tz && observes === true) {
    return [
      finding(
        "dst-ambiguous",
        "warning",
        `This job will be skipped one night a year and can run twice on another: ${tz} moves its clocks inside the 01:00–03:00 window, and this schedule runs at ${timeDesc}. Move it outside 01:00–03:00, or schedule it in UTC.`,
        "hour",
        span,
      ),
    ];
  }

  return [
    finding(
      "dst-ambiguous",
      "info",
      `If this machine's clocks change for daylight saving time, this job (scheduled at ${timeDesc}) will be skipped one night a year and can run twice on another. Move it outside 01:00–03:00, or schedule it in UTC, to be safe.`,
      "hour",
      span,
    ),
  ];
};
