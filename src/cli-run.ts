import { lint } from "./lint.js";
import type { Diagnostic } from "./types.js";

export interface CliIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  readStdin: () => Promise<string>;
  isTTY: boolean;
}

const FORMATS = ["pretty", "compact", "json", "github"] as const;

type Format = (typeof FORMATS)[number];

interface CliArgs {
  expression?: string;
  stdin: boolean;
  tz?: string;
  format: Format;
  strict: boolean;
  quiet: boolean;
}

const USAGE = `Usage: cronlint "<expression>" [--tz <IANA>] [--format <name>] [--strict] [--quiet]
       cronlint - [flags]           read expressions from stdin, one per line

Flags:
  --tz <zone>      IANA timezone for timezone-aware rules (e.g. Europe/Berlin)
  --format <name>  output format: pretty (default) | compact | json | github
  --json           same as --format json
  --strict         exit 1 on warnings as well as errors (CI mode)
  --quiet          only print error-severity findings (json always prints all)

Exit codes: 0 no errors · 1 errors found (or warnings with --strict) · 2 usage error
`;

function parseArgs(argv: string[]): CliArgs | { error: string } {
  const args: CliArgs = { stdin: false, format: "pretty", strict: false, quiet: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") {
      args.format = "json";
    } else if (a === "--format" || a.startsWith("--format=")) {
      const v = a === "--format" ? argv[++i] : a.slice("--format=".length);
      if (v === undefined) {
        return { error: "--format requires a value" };
      }

      if (!(FORMATS as readonly string[]).includes(v)) {
        return { error: `unknown format: ${v} (expected pretty, compact, json, or github)` };
      }

      args.format = v as Format;
    } else if (a === "--strict") {
      args.strict = true;
    } else if (a === "--quiet") {
      args.quiet = true;
    } else if (a === "--tz") {
      const v = argv[++i];
      if (v === undefined) {
        return { error: "--tz requires a value" };
      }

      args.tz = v;
    } else if (a === "--help" || a === "-h") {
      return { error: "" }; // caller prints usage; empty error means help
    } else if (a === "-") {
      args.stdin = true;
    } else if (a.startsWith("-") && a !== "-") {
      return { error: `unknown flag: ${a}` };
    } else {
      positional.push(a);
    }
  }

  if (args.stdin && positional.length > 0) {
    return { error: "cannot combine an expression argument with stdin mode (-)" };
  }

  if (!args.stdin && positional.length !== 1) {
    return {
      error:
        positional.length === 0 ? "missing cron expression" : "expected exactly one expression",
    };
  }

  if (positional.length === 1) {
    args.expression = positional[0];
  }

  return args;
}

const COLORS: Record<Diagnostic["severity"], string> = {
  error: "\x1b[31m",
  warning: "\x1b[33m",
  info: "\x1b[36m",
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const INDENT = "    ";

function visible(diagnostics: Diagnostic[], quiet: boolean): Diagnostic[] {
  return quiet ? diagnostics.filter((d) => d.severity === "error") : diagnostics;
}

function summaryLine(diagnostics: Diagnostic[]): string {
  const count = (s: Diagnostic["severity"]) => diagnostics.filter((d) => d.severity === s).length;
  const errors = count("error");
  const warnings = count("warning");
  const notes = count("info");

  return `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}, ${notes} note${notes === 1 ? "" : "s"}`;
}

function renderPretty(
  expression: string,
  diagnostics: Diagnostic[],
  io: CliIO,
  quiet: boolean,
  stdinHeader: boolean,
): void {
  const paint = (code: string, s: string) => (io.isTTY ? `${code}${s}${RESET}` : s);
  const shown = visible(diagnostics, quiet);

  if (diagnostics.length === 0) {
    if (!quiet) {
      io.stdout(`${expression}\n  ${paint(DIM, "No issues found.")}\n`);
    }

    return;
  }

  if (shown.length === 0) {
    return;
  }

  if (stdinHeader) {
    io.stdout(`${expression}\n`);
  }

  for (const d of shown) {
    io.stdout(`${paint(COLORS[d.severity], `${d.severity}[${d.rule}]`)}: ${d.message}\n\n`);
    io.stdout(`${INDENT}${expression}\n`);
    if (d.span) {
      const [start, end] = d.span;
      io.stdout(`${INDENT}${" ".repeat(start)}${"^".repeat(Math.max(1, end - start))}\n`);
    }

    io.stdout(`${INDENT}${paint(DIM, `= docs: ${d.docs}`)}\n\n`);
  }

  io.stdout(`${paint(DIM, summaryLine(diagnostics))}\n`);
}

function renderCompact(
  expression: string,
  diagnostics: Diagnostic[],
  io: CliIO,
  quiet: boolean,
): void {
  for (const d of visible(diagnostics, quiet)) {
    io.stdout(`${expression}: ${d.severity} [${d.rule}] ${d.message}\n`);
  }
}

// GitHub Actions workflow commands need %, CR, and LF escaped in the
// message, and additionally ':' and ',' escaped in property values.
function escapeGithubData(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeGithubProperty(s: string): string {
  return escapeGithubData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

const GITHUB_COMMAND: Record<Diagnostic["severity"], string> = {
  error: "error",
  warning: "warning",
  info: "notice",
};

function renderGithub(diagnostics: Diagnostic[], io: CliIO, quiet: boolean): void {
  for (const d of visible(diagnostics, quiet)) {
    io.stdout(
      `::${GITHUB_COMMAND[d.severity]} title=${escapeGithubProperty(d.rule)}::${escapeGithubData(d.message)}\n`,
    );
  }
}

function exitCodeFor(diagnostics: Diagnostic[], strict: boolean): number {
  if (diagnostics.some((d) => d.severity === "error")) {
    return 1;
  }

  if (strict && diagnostics.some((d) => d.severity === "warning")) {
    return 1;
  }

  return 0;
}

function lintOne(expression: string, args: CliArgs, io: CliIO, stdinMode: boolean): number {
  const { diagnostics } = lint(expression, args.tz ? { timezone: args.tz } : {});
  switch (args.format) {
    case "json":
      io.stdout(`${JSON.stringify({ expression, diagnostics })}\n`);
      break;
    case "compact":
      renderCompact(expression, diagnostics, io, args.quiet);
      break;
    case "github":
      renderGithub(diagnostics, io, args.quiet);
      break;
    case "pretty":
      renderPretty(expression, diagnostics, io, args.quiet, stdinMode);
      break;
  }

  return exitCodeFor(diagnostics, args.strict);
}

export async function runCli(argv: string[], io: CliIO): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    if (parsed.error === "") {
      io.stdout(USAGE);

      return 0;
    }

    io.stderr(`cronlint: ${parsed.error}\n\n${USAGE}`);

    return 2;
  }

  if (parsed.stdin) {
    const input = await io.readStdin();
    const lines = input
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    let worst = 0;
    for (const line of lines) {
      worst = Math.max(worst, lintOne(line, parsed, io, true));
    }

    return worst;
  }

  return lintOne(parsed.expression!, parsed, io, false);
}
