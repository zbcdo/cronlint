import { describe, expect, it } from "vitest";
import { runCli, type CliIO } from "../src/cli-run.js";

function fakeIO(stdin = "", isTTY = false) {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIO = {
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
    readStdin: async () => stdin,
    isTTY,
  };

  return { io, stdout: () => out.join(""), stderr: () => err.join("") };
}

describe("cli: exit codes", () => {
  it("clean expression exits 0", async () => {
    const { io, stdout } = fakeIO();
    expect(await runCli(["*/5 * * * *"], io)).toBe(0);
    expect(stdout()).toContain("No issues found");
  });

  it("warning exits 0 without --strict", async () => {
    const { io, stdout } = fakeIO();
    expect(await runCli(["0 0 1-7 * 1"], io)).toBe(0);
    expect(stdout()).toContain("dom-dow-both");
    expect(stdout()).toContain("https://cronhelp.me/rules/dom-dow-both");
  });

  it("warning exits 1 with --strict", async () => {
    const { io } = fakeIO();
    expect(await runCli(["0 0 1-7 * 1", "--strict"], io)).toBe(1);
  });

  it("error exits 1 and suppression holds", async () => {
    const { io, stdout } = fakeIO();
    expect(await runCli(["0 0 30 2 *"], io)).toBe(1);
    expect(stdout()).toContain("never-fires");
    expect(stdout()).not.toContain("dom-unreachable-months");
  });

  it("syntax error exits 1", async () => {
    const { io } = fakeIO();
    expect(await runCli(["not a cron at all"], io)).toBe(1);
  });

  it("usage failures exit 2", async () => {
    for (const argv of [[], ["--tz"], ["--bogus", "* * * * *"], ["a", "b"], ["-", "x"]]) {
      const { io, stderr } = fakeIO();
      expect(await runCli(argv as string[], io), JSON.stringify(argv)).toBe(2);
      expect(stderr()).toContain("Usage:");
    }
  });

  it("--help exits 0 with usage", async () => {
    const { io, stdout } = fakeIO();
    expect(await runCli(["--help"], io)).toBe(0);
    expect(stdout()).toContain("Usage:");
  });
});

describe("cli: --json", () => {
  it("emits the library Diagnostic shape", async () => {
    const { io, stdout } = fakeIO();
    expect(await runCli(["0 0 1-7 * 1", "--json"], io)).toBe(0);
    const parsed = JSON.parse(stdout());
    expect(parsed.expression).toBe("0 0 1-7 * 1");
    expect(parsed.diagnostics).toHaveLength(1);
    const d = parsed.diagnostics[0];
    expect(d).toMatchObject({
      rule: "dom-dow-both",
      severity: "warning",
      field: "dayOfMonth",
      docs: "https://cronhelp.me/rules/dom-dow-both",
    });
    expect(typeof d.message).toBe("string");
    expect(d.span).toEqual([4, 7]);
  });

  it("passes --tz through to the linter", async () => {
    const plain = fakeIO();
    await runCli(["30 2 * * *", "--json"], plain.io);
    expect(JSON.parse(plain.stdout()).diagnostics[0].severity).toBe("info");

    const zoned = fakeIO();
    await runCli(["30 2 * * *", "--json", "--tz", "America/New_York"], zoned.io);
    expect(JSON.parse(zoned.stdout()).diagnostics[0].severity).toBe("warning");

    const noDst = fakeIO();
    await runCli(["30 2 * * *", "--json", "--tz", "America/Port_of_Spain"], noDst.io);
    expect(JSON.parse(noDst.stdout()).diagnostics).toEqual([]);
  });
});

describe("cli: stdin mode", () => {
  it("lints one expression per line with aggregate exit code", async () => {
    const { io, stdout } = fakeIO("*/5 * * * *\n0 0 30 2 *\n\n0 0 * * 7\n");
    expect(await runCli(["-"], io)).toBe(1);
    expect(stdout()).toContain("never-fires");
    expect(stdout()).toContain("dow-sunday-7");
  });

  it("all-clean stdin exits 0", async () => {
    const { io } = fakeIO("*/5 * * * *\n0 0 * * *\n");
    expect(await runCli(["-"], io)).toBe(0);
  });

  it("json mode emits one object per line", async () => {
    const { io, stdout } = fakeIO("*/5 * * * *\n0 0 30 2 *\n");
    expect(await runCli(["-", "--json"], io)).toBe(1);
    const lines = stdout()
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[1].diagnostics[0].rule).toBe("never-fires");
  });
});

describe("cli: pretty format", () => {
  it("draws carets aligned under the finding's span", async () => {
    // dom-dow-both on "0 0 1-7 * 1" carries span [4, 7] ("1-7"); the
    // expression is indented four spaces, so the carets sit at 4 + 4.
    const { io, stdout } = fakeIO();
    await runCli(["0 0 1-7 * 1"], io);
    expect(stdout()).toContain("\n    0 0 1-7 * 1\n    " + " ".repeat(4) + "^^^\n");
  });

  it("heads each finding with severity[rule-id] and ends with a summary", async () => {
    const { io, stdout } = fakeIO();
    await runCli(["0 0 30 2 *"], io);
    expect(stdout()).toMatch(/^error\[never-fires\]: /);
    expect(stdout()).toMatch(/\n1 error, 0 warnings, 0 notes\n$/);
  });

  it("omits carets for findings without a span", async () => {
    const { io, stdout } = fakeIO();
    await runCli(["@daily"], io);
    expect(stdout()).toMatch(/^info\[nonportable-shortcut\]: /);
    expect(stdout()).not.toContain("^");
  });

  it("prints the expression as a header in stdin mode", async () => {
    const { io, stdout } = fakeIO("0 0 30 2 *\n");
    await runCli(["-"], io);
    expect(stdout().startsWith("0 0 30 2 *\n")).toBe(true);
  });
});

describe("cli: --format compact", () => {
  it("emits one greppable line per finding, prefixed by the expression", async () => {
    const { io, stdout } = fakeIO();
    expect(await runCli(["*/90 0 15 * 7", "--format", "compact"], io)).toBe(1);
    const lines = stdout().trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\*\/90 0 15 \* 7: error \[step-invalid\] /);
    expect(lines[1]).toMatch(/^\*\/90 0 15 \* 7: warning \[dom-dow-both\] /);
    expect(lines[2]).toMatch(/^\*\/90 0 15 \* 7: info \[dow-sunday-7\] /);
  });

  it("prints nothing for a clean expression", async () => {
    const { io, stdout } = fakeIO();
    expect(await runCli(["*/5 * * * *", "--format", "compact"], io)).toBe(0);
    expect(stdout()).toBe("");
  });

  it("keeps stdin findings attributable to their expression", async () => {
    const { io, stdout } = fakeIO("0 0 30 2 *\n0 0 * * 7\n");
    await runCli(["-", "--format", "compact"], io);
    const lines = stdout().trimEnd().split("\n");
    expect(lines[0]).toMatch(/^0 0 30 2 \*: error \[never-fires\] /);
    expect(lines[1]).toMatch(/^0 0 \* \* 7: info \[dow-sunday-7\] /);
  });
});

describe("cli: --format json and github", () => {
  it("--format json matches the --json alias", async () => {
    const viaFormat = fakeIO();
    await runCli(["0 0 1-7 * 1", "--format", "json"], viaFormat.io);
    const viaAlias = fakeIO();
    await runCli(["0 0 1-7 * 1", "--json"], viaAlias.io);
    expect(JSON.parse(viaFormat.stdout())).toEqual(JSON.parse(viaAlias.stdout()));
  });

  it("github format emits one workflow command per finding", async () => {
    const { io, stdout } = fakeIO();
    expect(await runCli(["*/90 0 15 * 7", "--format", "github"], io)).toBe(1);
    const lines = stdout().trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^::error title=step-invalid::./);
    expect(lines[1]).toMatch(/^::warning title=dom-dow-both::./);
    expect(lines[2]).toMatch(/^::notice title=dow-sunday-7::./);
  });

  it("github commands stay one line each with an escaped message", async () => {
    const { io, stdout } = fakeIO();
    await runCli(["0 0 30 2 *", "--format", "github"], io);
    for (const line of stdout().trimEnd().split("\n")) {
      expect(line).toMatch(/^::(error|warning|notice) title=[^:,]+::/);
    }
  });

  it("rejects an unknown format with exit 2", async () => {
    const { io, stderr } = fakeIO();
    expect(await runCli(["* * * * *", "--format", "yaml"], io)).toBe(2);
    expect(stderr()).toContain("Usage:");
  });
});

describe("cli: --quiet and colors", () => {
  it("quiet shows only error findings", async () => {
    const { io, stdout } = fakeIO();
    expect(await runCli(["0 0 1-7 * 1", "--quiet"], io)).toBe(0);
    expect(stdout()).toBe("");

    const errCase = fakeIO();
    expect(await runCli(["0 0 30 2 *", "--quiet"], errCase.io)).toBe(1);
    expect(errCase.stdout()).toContain("never-fires");
  });

  it("colors only when TTY", async () => {
    const tty = fakeIO("", true);
    await runCli(["0 0 30 2 *"], tty.io);
    expect(tty.stdout()).toContain("\x1b[31m");

    const pipe = fakeIO("", false);
    await runCli(["0 0 30 2 *"], pipe.io);
    expect(pipe.stdout()).not.toContain("\x1b[");
  });
});
