import { parse } from "./parse.js";
import { rules } from "./rules/index.js";
import type { Diagnostic, LintOptions, ParsedCron } from "./types.js";

const SEVERITY_RANK: Record<Diagnostic["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** What {@link lint} returns: the parsed expression (when parsing succeeded) and all findings. */
export interface LintResult {
  /** The parsed expression; absent when the input could not be parsed. */
  cron?: ParsedCron;
  /** All findings, sorted by severity (errors first) and then by rule id. */
  diagnostics: Diagnostic[];
}

/**
 * Parse a cron expression and run all thirteen lint rules on it.
 *
 * If the expression does not parse, the parse errors are returned and no
 * rules run. Pass `options.timezone` (an IANA name like `Europe/Berlin`)
 * to make the daylight-saving check specific to where the job runs.
 *
 * ```ts
 * const { diagnostics } = lint("0 0 30 2 *");
 * // diagnostics[0].rule === "never-fires"
 * ```
 */
export function lint(expr: string, opts: LintOptions = {}): LintResult {
  const parsed = parse(expr);
  if (!parsed.cron || parsed.diagnostics.some((d) => d.severity === "error")) {
    return parsed;
  }

  let diagnostics = [...parsed.diagnostics];
  for (const rule of rules) {
    diagnostics.push(...rule(parsed.cron, opts));
  }

  // Suppression interlocks: a total impossibility (or an intentional
  // leap-day schedule) makes the month-skipping warning redundant, and an
  // every-minute-on-restricted-dates warning covers the frequency note.
  const fired = new Set(diagnostics.map((d) => d.rule));
  if (fired.has("never-fires") || fired.has("leap-day-only")) {
    diagnostics = diagnostics.filter((d) => d.rule !== "dom-unreachable-months");
  }

  if (fired.has("star-minute-restricted")) {
    diagnostics = diagnostics.filter((d) => d.rule !== "freq-extreme");
  }

  diagnostics.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0),
  );

  return { cron: parsed.cron, diagnostics };
}
