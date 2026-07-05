import type { Rule } from "../types.js";
import { domDowBoth } from "./dom-dow-both.js";
import { domUnreachableMonths } from "./dom-unreachable-months.js";
import { dowSunday7 } from "./dow-sunday-7.js";
import { dstAmbiguous } from "./dst-ambiguous.js";
import { freqExtreme } from "./freq-extreme.js";
import { leapDayOnly } from "./leap-day-only.js";
import { neverFires } from "./never-fires.js";
import { nonportableShortcut } from "./nonportable-shortcut.js";
import { rangeWrap } from "./range-wrap.js";
import { redundantTerm } from "./redundant-term.js";
import { starMinuteRestricted } from "./star-minute-restricted.js";
import { stepInvalid } from "./step-invalid.js";
import { stepUneven } from "./step-uneven.js";

/** The thirteen rules, in a fixed order; lint() sorts the combined output by severity and rule id. */
export const rules: Rule[] = [
  domDowBoth,
  dstAmbiguous,
  domUnreachableMonths,
  stepInvalid,
  stepUneven,
  dowSunday7,
  freqExtreme,
  neverFires,
  leapDayOnly,
  rangeWrap,
  redundantTerm,
  starMinuteRestricted,
  nonportableShortcut,
];
