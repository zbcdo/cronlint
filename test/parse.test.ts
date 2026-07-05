import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { resolveField } from "../src/resolve.js";

describe("parse: dialect detection", () => {
  it("parses 5-field as standard5", () => {
    const { cron, diagnostics } = parse("*/5 * * * *");
    expect(diagnostics).toEqual([]);
    expect(cron?.dialect).toBe("standard5");
    expect(cron?.fields.map((f) => f.field)).toEqual([
      "minute",
      "hour",
      "dayOfMonth",
      "month",
      "dayOfWeek",
    ]);
  });

  it("parses 6-field as withSeconds6", () => {
    const { cron } = parse("0 */5 * * * *");
    expect(cron?.dialect).toBe("withSeconds6");
    expect(cron?.fields[0]?.field).toBe("second");
  });

  it("rejects 4 fields with a full-input span", () => {
    const { cron, diagnostics } = parse("* * * *");
    expect(cron).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({
      rule: "syntax",
      severity: "error",
      span: [0, 7],
    });
  });

  it("rejects 7 fields", () => {
    const { cron } = parse("* * * * * * *");
    expect(cron).toBeUndefined();
  });

  it("rejects empty input", () => {
    const { cron, diagnostics } = parse("   ");
    expect(cron).toBeUndefined();
    expect(diagnostics[0]?.rule).toBe("syntax");
  });

  it("handles extra whitespace between fields", () => {
    const { cron, diagnostics } = parse("  0   0  1  *   *  ");
    expect(diagnostics).toEqual([]);
    expect(cron?.fields[0]?.raw).toBe("0");
  });
});

describe("parse: bounds validation with spans", () => {
  it("flags minute 60 with field and span", () => {
    const { cron, diagnostics } = parse("60 * * * *");
    expect(cron).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({
      rule: "syntax",
      severity: "error",
      field: "minute",
      span: [0, 2],
    });
  });

  it("flags hour 24", () => {
    const { diagnostics } = parse("0 24 * * *");
    expect(diagnostics[0]).toMatchObject({ field: "hour", span: [2, 4] });
  });

  it("flags month 13 and day 32", () => {
    const { diagnostics } = parse("0 0 32 13 *");
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({ field: "dayOfMonth", span: [4, 6] });
    expect(diagnostics[1]).toMatchObject({ field: "month", span: [7, 9] });
  });

  it("flags day-of-month 0", () => {
    const { diagnostics } = parse("0 0 0 * *");
    expect(diagnostics[0]).toMatchObject({ field: "dayOfMonth" });
  });

  it("flags out-of-range range endpoint", () => {
    const { diagnostics } = parse("50-70 * * * *");
    expect(diagnostics[0]).toMatchObject({ field: "minute", span: [0, 5] });
  });

  it("flags bad token inside a list with precise span", () => {
    const { diagnostics } = parse("1,99,3 * * * *");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ field: "minute", span: [2, 4] });
  });

  it("flags garbage token", () => {
    const { diagnostics } = parse("foo * * * *");
    expect(diagnostics[0]).toMatchObject({ rule: "syntax", field: "minute" });
  });

  it("flags non-integer step", () => {
    const { diagnostics } = parse("*/x * * * *");
    expect(diagnostics[0]).toMatchObject({ rule: "syntax", severity: "error", field: "minute" });
  });

  it("flags empty list term", () => {
    const { diagnostics } = parse("1,,3 * * * *");
    expect(diagnostics[0]).toMatchObject({ rule: "syntax", severity: "error", field: "minute" });
  });
});

describe("parse: names", () => {
  it("resolves month names case-insensitively", () => {
    const { cron } = parse("0 0 1 jan,FEB,Mar *");
    const month = cron?.fields[3];
    expect(month?.terms.map((t) => t.value)).toEqual([1, 2, 3]);
    expect(month?.terms.map((t) => t.raw)).toEqual(["jan", "FEB", "Mar"]);
  });

  it("resolves DOW names and ranges", () => {
    const { cron } = parse("0 0 * * MON-FRI");
    const dow = cron?.fields[4]?.terms[0];
    expect(dow).toMatchObject({ kind: "range", from: 1, to: 5, raw: "MON-FRI" });
  });

  it("rejects month names in DOW field", () => {
    const { diagnostics } = parse("0 0 * * JAN");
    expect(diagnostics[0]).toMatchObject({ rule: "syntax", field: "dayOfWeek" });
  });
});

describe("parse: DOW 7 normalization", () => {
  it("normalizes 7 to 0 keeping raw", () => {
    const { cron, diagnostics } = parse("0 0 * * 7");
    expect(diagnostics).toEqual([]);
    const t = cron?.fields[4]?.terms[0];
    expect(t).toMatchObject({ kind: "value", value: 0, raw: "7" });
  });

  it("keeps range endpoints as written, mapping 7 to 0 at resolution", () => {
    const { cron } = parse("0 0 * * 5-7");
    const t = cron?.fields[4]?.terms[0];
    expect(t).toMatchObject({ from: 5, to: 7, raw: "5-7" });
    expect(resolveField(cron!.fields[4]!)).toEqual([0, 5, 6]);
  });
});

describe("parse: shortcuts", () => {
  it.each([
    ["@yearly", "0 0 1 1 *"],
    ["@annually", "0 0 1 1 *"],
    ["@monthly", "0 0 1 * *"],
    ["@weekly", "0 0 * * 0"],
    ["@daily", "0 0 * * *"],
    ["@midnight", "0 0 * * *"],
    ["@hourly", "0 * * * *"],
  ])("%s expands to %s", (shortcut, expansion) => {
    const { cron, diagnostics } = parse(shortcut);
    expect(diagnostics).toEqual([]);
    expect(cron?.shortcut).toBe(shortcut);
    expect(cron?.raw).toBe(shortcut);
    expect(cron?.fields.map((f) => f.raw).join(" ")).toBe(expansion);
  });

  it("parses @reboot as valid with no fields", () => {
    const { cron, diagnostics } = parse("@reboot");
    expect(diagnostics).toEqual([]);
    expect(cron?.shortcut).toBe("@reboot");
    expect(cron?.fields).toEqual([]);
  });

  it("is case-insensitive for shortcuts", () => {
    const { cron } = parse("@DAILY");
    expect(cron?.shortcut).toBe("@DAILY");
  });

  it("rejects unknown shortcuts", () => {
    const { cron, diagnostics } = parse("@fortnightly");
    expect(cron).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({ rule: "syntax", severity: "error", span: [0, 12] });
  });
});

describe("parse: unsupported dialect tokens", () => {
  it.each([
    ["0 0 L * *", "L", "dayOfMonth"],
    ["0 0 15W * *", "W", "dayOfMonth"],
    ["0 0 * * 1#2", "#", "dayOfWeek"],
    ["0 0 ? * 1", "?", "dayOfMonth"],
  ])("%s produces unsupported-token for %s", (expr, token, field) => {
    const { cron, diagnostics } = parse(expr);
    expect(cron).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      rule: "unsupported-token",
      severity: "error",
      field,
    });
    expect(diagnostics[0]?.span).toBeDefined();
  });
});

describe("parse: terms and restricted flag", () => {
  it("lone star is unrestricted", () => {
    const { cron } = parse("* * * * *");
    expect(cron?.fields.every((f) => !f.restricted)).toBe(true);
  });

  it("*/5 is restricted", () => {
    const { cron } = parse("*/5 * * * *");
    expect(cron?.fields[0]?.restricted).toBe(true);
    expect(cron?.fields[0]?.terms[0]).toMatchObject({ kind: "step", step: 5 });
  });

  it("star in a list is restricted", () => {
    const { cron } = parse("*,5 * * * *");
    expect(cron?.fields[0]?.restricted).toBe(true);
  });

  it("parses a-b/n and a/n steps", () => {
    const { cron } = parse("0-30/10 5/2 * * *");
    expect(cron?.fields[0]?.terms[0]).toMatchObject({
      kind: "step",
      from: 0,
      to: 30,
      step: 10,
    });
    expect(cron?.fields[1]?.terms[0]).toMatchObject({
      kind: "step",
      from: 5,
      step: 2,
    });
  });

  it("keeps exact raw slices on terms", () => {
    const { cron } = parse("1-5,*/10 * * * *");
    expect(cron?.fields[0]?.terms.map((t) => t.raw)).toEqual(["1-5", "*/10"]);
    expect(cron?.fields[0]?.raw).toBe("1-5,*/10");
  });
});

describe("resolveField", () => {
  it("resolves stars, values, ranges, steps", () => {
    const { cron } = parse("*/15 1,2 10-12 * *");
    expect(resolveField(cron!.fields[0]!)).toEqual([0, 15, 30, 45]);
    expect(resolveField(cron!.fields[1]!)).toEqual([1, 2]);
    expect(resolveField(cron!.fields[2]!)).toEqual([10, 11, 12]);
  });

  it("resolves wrapped ranges", () => {
    const { cron } = parse("0 22-2 * * *");
    expect(resolveField(cron!.fields[1]!)).toEqual([0, 1, 2, 22, 23]);
  });

  it("resolves DOW star to 0-6", () => {
    const { cron } = parse("0 0 * * *");
    expect(resolveField(cron!.fields[4]!)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
