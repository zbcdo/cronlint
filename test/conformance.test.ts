/**
 * Conformance runner — GENERATED from conformance/vectors/*.json.
 * Contract: each vector's `expect` is the COMPLETE finding set, matched on
 * rule + severity (+ field when the vector specifies one), order-insensitive.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { lint } from "../src/lint.js";
import type { Diagnostic } from "../src/types.js";

interface Expected {
  rule: string;
  severity: Diagnostic["severity"];
  field?: string;
}

interface Vector {
  name: string;
  expression: string;
  options?: { timezone?: string };
  expect: Expected[];
}

interface VectorFile {
  rule: string;
  vectors: Vector[];
}

const vectorsDir = join(dirname(fileURLToPath(import.meta.url)), "../conformance/vectors");

function describeDiag(d: { rule: string; severity: string; field?: string }): string {
  return `${d.rule}/${d.severity}${d.field ? `/${d.field}` : ""}`;
}

for (const file of readdirSync(vectorsDir).sort()) {
  const { rule, vectors } = JSON.parse(readFileSync(join(vectorsDir, file), "utf8")) as VectorFile;

  describe(`conformance: ${rule} (${file})`, () => {
    for (const vector of vectors) {
      it(vector.name, () => {
        const { diagnostics } = lint(vector.expression, vector.options ?? {});
        const remaining = [...diagnostics];

        for (const expected of vector.expect) {
          const idx = remaining.findIndex(
            (d) =>
              d.rule === expected.rule &&
              d.severity === expected.severity &&
              (expected.field === undefined || d.field === expected.field),
          );
          expect(
            idx,
            `missing finding ${describeDiag(expected)} for "${vector.expression}"; got: [${diagnostics.map(describeDiag).join(", ")}]`,
          ).toBeGreaterThanOrEqual(0);
          remaining.splice(idx, 1);
        }

        expect(
          remaining.map(describeDiag),
          `unexpected extra findings for "${vector.expression}"`,
        ).toEqual([]);
      });
    }
  });
}
