// redundant-term — part of a list adds nothing.
//
// A `*` inside a list (`*,5`) already selects every value, duplicates
// (`5,5`) select the same value twice, and `1-10,5` names a value the
// range already covers. Cron runs the schedule the author probably
// wanted, so nothing breaks — but the extra term means the author likely
// believed it did something (for example, that `*,5` emphasizes minute
// 5, or that `1-10,5` extends the range). Pointing it out catches the
// misunderstanding before it causes a real mistake elsewhere.
//
// Wrong:  0 0 1-10,5 * *   (the 5 is already inside 1-10)
// Right:  0 0 1-10 * *     (same schedule, says what it means)

import type { Field, Rule, Term } from "../types.js";
import { resolveTerm } from "../resolve.js";
import { DAY_NAMES_EN, FIELD_LABEL, MONTH_NAMES_EN, fieldSpan, finding } from "./util.js";

// Quote a term, adding the name when the value has one: "'7' (Sunday)".
function quoteTerm(term: Term, field: Field): string {
  if (term.kind === "value" && field === "dayOfWeek") {
    return `'${term.raw}' (${DAY_NAMES_EN[term.value!]})`;
  }

  if (term.kind === "value" && field === "month") {
    return `'${term.raw}' (${MONTH_NAMES_EN[term.value!]})`;
  }

  return `'${term.raw}'`;
}

export const redundantTerm: Rule = (cron) => {
  const out = [];
  for (const pf of cron.fields) {
    if (pf.terms.length < 2) {
      continue;
    }

    let message: string | undefined;
    const starTerm = pf.terms.find((t) => t.kind === "star");
    if (starTerm) {
      message = `The '*' in '${pf.raw}' already covers every ${FIELD_LABEL[pf.field]} value, so the other entries in the list change nothing. If you meant only those entries, remove the '*'.`;
    } else {
      const sets = pf.terms.map((t) => new Set(resolveTerm(t, pf.field)));
      outer: for (let i = 0; i < sets.length; i++) {
        for (let j = 0; j < sets.length; j++) {
          if (i === j || sets[i]!.size === 0) {
            continue;
          }

          // Two terms selecting exactly the same values would otherwise be
          // reported twice, once in each direction; keep only one direction.
          const identical = sets[i]!.size === sets[j]!.size;
          if (identical && i < j) {
            continue;
          }

          if ([...sets[i]!].every((v) => sets[j]!.has(v))) {
            message = `${quoteTerm(pf.terms[i]!, pf.field)} in '${pf.raw}' changes nothing — ${quoteTerm(pf.terms[j]!, pf.field)} already covers it. Remove it so the schedule reads the way it actually runs.`;
            break outer;
          }
        }
      }
    }

    if (message) {
      out.push(finding("redundant-term", "info", message, pf.field, fieldSpan(cron, pf.field)));
    }
  }

  return out;
};
