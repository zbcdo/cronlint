# cronlint

A zero-dependency cron expression parser and linter. It catches the schedule bugs that syntax checkers can't: expressions that never fire, fire 1,440 times more often than intended, silently skip months, or break when the clocks change.

- **Parses** 5-field standard cron and 6-field (leading seconds), plus `@hourly`-style shortcuts.
- **Lints** with thirteen rules covering real-world cron accidents, each with a precise severity and a docs link.
- **Never crashes, never passes silently** — the special characters `L W # ?` from Quartz and AWS EventBridge produce structured `unsupported-token` diagnostics naming the schedulers that do support them.
- **Zero runtime dependencies.** The daylight-saving-time check uses the built-in `Intl` API.
- **Language-neutral conformance suite** — the rule behavior is defined by JSON test vectors shipped in the package, so ports to other languages can prove they match.

## Install

```sh
npm install cronlint        # library
npm install -g cronlint     # CLI
```

## CLI

```
cronlint "<expression>" [--tz <IANA>] [--format <name>] [--strict] [--quiet]
```

The default **pretty** format points at the offending part of the expression:

```sh
$ cronlint "0 0 1-7 * 1"
warning[dom-dow-both]: This job runs on the 1st through the 7th of every month,
and also on every Monday — about 124 days a year, two schedules in one...

    0 0 1-7 * 1
        ^^^
    = docs: https://cronhelp.me/rules/dom-dow-both

0 errors, 1 warning, 0 notes
```

**compact** prints one greppable line per finding:

```sh
$ cronlint "0 0 30 2 *" --format compact
0 0 30 2 *: error [never-fires] This job will never run: it is scheduled ONLY for the 30th of February...
```

**json** emits the library's shape, one object per expression (`--json` is an alias):

```sh
$ cronlint "0 0 30 2 *" --format json
{"expression":"0 0 30 2 *","diagnostics":[{"rule":"never-fires","severity":"error",...}]}
```

**github** emits GitHub Actions workflow commands, so CI runs annotate natively:

```sh
$ cronlint "0 0 30 2 *" --format github
::error title=never-fires::This job will never run: it is scheduled ONLY for the 30th of February...
```

| flag              | effect                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--format <name>` | output format: `pretty` (default), `compact`, `json`, or `github`                                                                                       |
| `--tz <zone>`     | IANA timezone name, e.g. `Europe/Berlin` (`dst-ambiguous` becomes a warning in zones that change their clocks, and stays silent in zones that never do) |
| `--json`          | same as `--format json`; `diagnostics` is exactly the library's `Diagnostic[]` shape                                                                    |
| `--strict`        | warnings also fail (exit 1) — CI mode                                                                                                                   |
| `--quiet`         | only print error-severity findings (json always prints all)                                                                                             |

**Exit codes:** `0` no errors (warnings/info allowed) · `1` error-severity findings (or warnings with `--strict`) · `2` usage error.

**Stdin mode** — pass `-` and pipe one expression per line; the exit code aggregates across all lines. Lint your live crontab:

```sh
crontab -l | grep -v '^\s*\(#\|$\)' | awk '{print $1" "$2" "$3" "$4" "$5}' | cronlint -
```

## Library

```ts
import { lint, parse } from "cronlint";

const { cron, diagnostics } = lint("0 0 30 2 *", { timezone: "Europe/Berlin" });
// diagnostics[0] = {
//   rule: 'never-fires',
//   severity: 'error',
//   message: "This job will never run: it is scheduled ONLY for the 30th of February...",
//   field: 'dayOfMonth',
//   span: [4, 6],                       // index range into the raw input
//   docs: 'https://cronhelp.me/rules/never-fires'
// }
```

`parse(expr)` returns `{ cron?: ParsedCron, diagnostics: Diagnostic[] }` — the expression broken into fields and terms (each keeping the exact characters it was written with) without running any rules. `lint(expr, opts?)` is parse plus rules; if parsing fails, rules do not run and you get the parse errors. Parse errors and lint findings share the same `Diagnostic` shape.

## The thirteen rules

Rule ids are permanent API. Severity spread: 2 error, 5 warning, 6 info.

| rule                     | severity | example           | what it catches                                                                                                                       |
| ------------------------ | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `never-fires`            | error    | `0 0 30 2 *`      | every selected day/month combination is impossible (Feb is capped at 29 — a leap day is a real day)                                   |
| `step-invalid`           | error    | `*/90 * * * *`    | step of 0, or bigger than the field can hold — `*/90` in minutes fires hourly, not every 90 minutes                                   |
| `dom-unreachable-months` | warning  | `0 0 31 * *`      | selected days that don't exist in some selected months — those months silently skip                                                   |
| `dom-dow-both`           | warning  | `0 0 1-7 * 1`     | day-of-month and day-of-week both set: cron runs on days matching either one — two overlapping schedules, not "first Monday"          |
| `star-minute-restricted` | warning  | `* * 1 * *`       | minute and hour both `*` with a date field restricted — 1,440 runs on the 1st; author almost always meant `0 0 1 * *`                 |
| `dst-ambiguous`          | warning¹ | `30 2 * * *`      | fixed times between 01:00–03:00 get skipped (spring) or run twice (autumn) where clocks change for daylight saving time               |
| `range-wrap`             | warning  | `0 0 * * FRI-MON` | a range whose start is bigger than its end: cron programs disagree — some reject it, some misread it, some wrap around                |
| `freq-extreme`           | info     | `* * * * *`       | the two classic accidents: every minute across the board, or exactly once a year                                                      |
| `leap-day-only`          | info     | `0 0 29 2 *`      | fires only on February 29 — legitimate, but worth confirming (this is _not_ `never-fires`)                                            |
| `nonportable-shortcut`   | info     | `@reboot`         | `@reboot` cannot be written as five fields; other `@` shortcuts are not accepted by every scheduler                                   |
| `redundant-term`         | info     | `0 0 1-10,5 * *`  | `*` inside a list, a repeated value, or a term another term already covers — the schedule works, but says less than the author thinks |
| `step-uneven`            | info     | `0 0 */7 * *`     | step doesn't divide the field evenly: fires on the 1st, 8th, 15th, 22nd, 29th, then _starts over when the month ends_                 |
| `dow-sunday-7`           | info     | `0 0 * * 7`       | `7` for Sunday is rejected by some crons; use `0` or `SUN`                                                                            |

¹ `dst-ambiguous` is a **warning** when `timezone` names a zone that changes its clocks, **info** with no timezone, and does not fire for zones that never change them (e.g. `America/Port_of_Spain`).

**Suppression:** when `never-fires` reports an expression, `dom-unreachable-months` stays silent on it (one report, not two), and `star-minute-restricted` likewise silences `freq-extreme`.

## Conformance contract

The rule behavior above is defined by the JSON vector files in [`conformance/`](conformance/), which ship in the npm package. cronlint's own test runner is generated from them, and a port in any language can claim conformance by passing them.

Each `conformance/vectors/*.json` file follows [`conformance/schema.json`](conformance/schema.json):

```json
{
  "$schema": "../schema.json",
  "rule": "dom-dow-both",
  "vectors": [
    {
      "name": "first-week-and-monday",
      "expression": "0 0 1-7 * 1",
      "options": {},
      "expect": [
        {
          "rule": "dom-dow-both",
          "severity": "warning",
          "field": "dayOfMonth"
        }
      ]
    },
    {
      "name": "dom-only-is-clean",
      "expression": "0 0 1-7 * *",
      "expect": []
    }
  ]
}
```

What the contract requires:

- `expect` is the **complete** set of findings for the expression given the options — an implementation must produce these findings and **no others**.
- Findings are matched on `rule` + `severity`, plus `field` when the expected finding specifies one. Order does not matter.
- `message`, `span`, and `docs` are presentation and are **not** part of the contract; message text may change in any release.
- There is one file per rule, plus `syntax.json` (parse errors, including the `unsupported-token` diagnostics for `L W # ?`) and `clean.json` (expressions that must produce zero findings — as important as the positive cases).
- Every rule file contains at least 6 vectors, at least 2 of which are clean or almost-firing expressions; the suppression cases and the leap-year cases have vectors of their own.

## Contributing

`npm install` sets up git hooks via husky: a pre-commit hook runs eslint and prettier on the files you staged (never the whole repo), and a pre-push hook runs the full test suite, including the conformance runner. The hooks are a convenience for fast feedback — CI is the authoritative gate, so a skipped or bypassed hook never decides what merges. These hooks exist only in the development repo; installing `cronlint` from npm runs no scripts at all.

## License

MIT © René J. Peter
