/**
 * Covers defensive branches that normal expressions cannot reach through
 * lint(): empty resolved sets from zero steps, fabricated field layouts,
 * and unrecognized timezone ids.
 */
import { describe, expect, it } from "vitest";
import { lint, parse } from "../src/index.js";
import { getField, resolveTerm } from "../src/resolve.js";
import { fieldSpan } from "../src/rules/util.js";
import { freqExtreme } from "../src/rules/freq-extreme.js";
import { zoneObservesDst } from "../src/rules/dst-ambiguous.js";
import type { ParsedCron } from "../src/types.js";

describe("parser: remaining error branches", () => {
  it("rejects a double step suffix", () => {
    const { diagnostics } = parse("*/5/2 * * * *");

    expect(diagnostics[0]).toMatchObject({ rule: "syntax", severity: "error", field: "minute" });
  });

  it("rejects a range with an unknown name endpoint", () => {
    const { diagnostics } = parse("0 0 * * MON-XYZ");

    expect(diagnostics[0]).toMatchObject({ rule: "syntax", field: "dayOfWeek" });
  });
});

describe("resolveTerm: degenerate steps", () => {
  it("a zero step selects nothing", () => {
    expect(resolveTerm({ kind: "step", step: 0, raw: "*/0" }, "minute")).toEqual([]);
  });

  it("a step over a wrapped range walks both segments", () => {
    expect(resolveTerm({ kind: "step", from: 22, to: 2, step: 2, raw: "22-2/2" }, "hour")).toEqual([
      22, 0, 2,
    ]);
  });

  it("getField finds fields by name", () => {
    const { cron } = parse("0 0 * * *");

    expect(getField(cron!, "hour")?.raw).toBe("0");
    expect(getField(cron!, "second")).toBeUndefined();
  });
});

describe("rules: unreachable-set guards", () => {
  it("never-fires and dom-unreachable-months skip an empty day set", () => {
    const rules = lint("0 0 */0 * *").diagnostics.map((d) => d.rule);

    expect(rules).toEqual(["step-invalid"]);
  });

  it("never-fires skips an empty month set", () => {
    const rules = lint("0 0 30 */0 *").diagnostics.map((d) => d.rule);

    expect(rules).toEqual(["step-invalid"]);
  });

  it("step-uneven measures a/n and wrapped-range steps", () => {
    expect(lint("0 5/2 * * *").diagnostics.map((d) => d.rule)).toContain("step-uneven");
    expect(lint("0 22-2/3 * * *").diagnostics.map((d) => d.rule)).toContain("step-uneven");
  });

  it("freq-extreme skips a cron with hour and minute but no date fields", () => {
    const { cron } = parse("0-59 0-23 * * *");
    const partial: ParsedCron = { ...cron!, fields: cron!.fields.slice(0, 2) };

    expect(freqExtreme(partial, {}).map((d) => d.rule)).toEqual(["freq-extreme"]);

    const single: ParsedCron = { ...cron!, fields: [cron!.fields[0]!, cron!.fields[1]!] };
    single.fields[0] = { ...single.fields[0]!, terms: [{ kind: "value", value: 0, raw: "0" }] };

    expect(freqExtreme(single, {})).toEqual([]);
  });
});

describe("fieldSpan edge cases", () => {
  it("returns undefined for shortcut input and unknown fields", () => {
    const { cron } = parse("@yearly");

    expect(fieldSpan(cron!, "minute")).toBeUndefined();

    const plain = parse("0 0 * * *").cron!;

    expect(fieldSpan(plain, "second")).toBeUndefined();
  });

  it("returns undefined when raw has fewer tokens than fields", () => {
    const plain = parse("0 0 * * *").cron!;
    const broken: ParsedCron = { ...plain, raw: "0" };

    expect(fieldSpan(broken, "hour")).toBeUndefined();
  });
});

describe("timezone recognition", () => {
  it("classifies DST-observing, fixed-offset, and unknown zones", () => {
    expect(zoneObservesDst("America/New_York")).toBe(true);
    expect(zoneObservesDst("UTC")).toBe(false);
    expect(zoneObservesDst("Not/AZone")).toBeNull();
  });

  it("an unknown timezone falls back to the no-timezone behavior", () => {
    const { diagnostics } = lint("30 2 * * *", { timezone: "Not/AZone" });

    expect(diagnostics[0]).toMatchObject({ rule: "dst-ambiguous", severity: "info" });
  });
});
