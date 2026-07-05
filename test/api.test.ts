import { describe, expect, it } from "vitest";
import { lint, parse, resolveField } from "../src/index.js";

describe("public API", () => {
  it("exports parse and lint operating on the same shapes", () => {
    const parsed = parse("0 0 1-7 * 1");
    expect(parsed.cron?.dialect).toBe("standard5");
    expect(parsed.diagnostics).toEqual([]);

    const linted = lint("0 0 1-7 * 1");
    expect(linted.cron?.raw).toBe(parsed.cron?.raw);
    expect(linted.diagnostics.map((d) => d.rule)).toEqual(["dom-dow-both"]);
    expect(linted.diagnostics[0]?.docs).toBe("https://cronhelp.me/rules/dom-dow-both");
  });

  it("lint returns parse diagnostics without running rules on parse failure", () => {
    const { cron, diagnostics } = lint("61 * * * *");
    expect(cron).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe("syntax");
  });

  it("sorts output by severity then rule id", () => {
    const { diagnostics } = lint("*/90 0 15 * 7");
    expect(diagnostics.map((d) => `${d.severity}:${d.rule}`)).toEqual([
      "error:step-invalid",
      "warning:dom-dow-both",
      "info:dow-sunday-7",
    ]);
  });
});

describe("public API: resolveField", () => {
  it("expands stars, values, lists, ranges, and steps to sorted values", () => {
    const { cron } = parse("*/15 8-10 1,15 * *");
    expect(resolveField(cron!.fields[0]!)).toEqual([0, 15, 30, 45]);
    expect(resolveField(cron!.fields[1]!)).toEqual([8, 9, 10]);
    expect(resolveField(cron!.fields[2]!)).toEqual([1, 15]);
    expect(resolveField(cron!.fields[3]!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("wraps backwards ranges around the end of the field", () => {
    const { cron } = parse("50-10 22-2 * * *");
    expect(resolveField(cron!.fields[0]!)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
    ]);
    expect(resolveField(cron!.fields[1]!)).toEqual([0, 1, 2, 22, 23]);
  });

  it("maps day-of-week 7 to 0 and removes the duplicate", () => {
    const { cron } = parse("0 0 * * 0,5-7");
    expect(resolveField(cron!.fields[4]!)).toEqual([0, 5, 6]);
  });

  it("deduplicates overlapping list terms", () => {
    const { cron } = parse("0 0 1-10,5-15 * *");
    expect(resolveField(cron!.fields[2]!)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });
});
