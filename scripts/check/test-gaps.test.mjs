#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Pins the test-gap ratchet contract: an export no test file names is a gap
// and one a test does name is not; `export interface` / `export type` are not
// gaps while enum / const / function / class are; the generated-file and
// migration paths yield no gaps at all; coverage matching is whole-word, so
// `getValueFactory` in a test does NOT cover `getValue`; and a baseline the
// gate cannot read fails closed instead of reading as zero-known gaps.

import { expect, test, } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { dirname, join, } from "node:path";

const GATE = "test-gaps.mjs";
const BASELINE_REL = join("scripts", "check", "test-gaps-baseline.json",);

/** An empty baseline: every gap the scan finds is therefore a NEW gap. */
const NO_GAPS = JSON.stringify({ generatedAt: "1970-01-01T00:00:00.000Z", count: 0, gaps: [], },);

/**
 * One throwaway repo root per call, holding `files` (repo-relative path →
 * content) and a copy of the gate at scripts/check/ — the gate resolves its
 * own repo root and default baseline from `import.meta.dir`, so it has to run
 * from inside the fixture. `baseline` is written verbatim (null leaves the
 * file absent). Removed in `finally` so a failed assertion cannot leak it.
 *
 * Parallel-safe: every call owns a unique mkdtemp root — no fixed paths, no
 * ports, no shared globals — so a failed assertion cannot poison sibling
 * tests.
 *
 * Returns the exit code, both streams, and the baseline file as it stands
 * after the run (null when absent) so the write path is assertable.
 */
function scanFixture(files, { baseline = NO_GAPS, args = [], } = {}) {
  const root = mkdtempSync(join(tmpdir(), "test-gaps-",),);
  try {
    const script = join(root, "scripts", "check", GATE,);
    mkdirSync(join(root, "scripts", "check",), { recursive: true, },);
    copyFileSync(join(import.meta.dir, GATE,), script,);
    if (baseline !== null) { writeFileSync(join(root, BASELINE_REL,), baseline,); }
    for (const [name, content,] of Object.entries(files,)) {
      const file = join(root, name,);
      mkdirSync(dirname(file,), { recursive: true, },);
      writeFileSync(file, content,);
    }
    const proc = Bun.spawnSync(["bun", "run", script, ...args,], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    },);
    let written = null;
    try {
      written = readFileSync(join(root, BASELINE_REL,), "utf8",);
    } catch { /* no baseline on disk (non-write run, or a fail-closed abort) */ }
    return {
      code: proc.exitCode,
      err: new TextDecoder().decode(proc.stderr,),
      out: new TextDecoder().decode(proc.stdout,),
      written,
    };
  } finally {
    rmSync(root, { recursive: true, force: true, },);
  }
}

test("an export no test names is a gap; one a test names is not", () => {
  const { code, err, } = scanFixture({
    "src/thing.ts": "export function uncoveredFn() {\n  return 1;\n}\nexport function coveredFn() {\n  return 2;\n}\n",
    "src/thing.test.ts": "import { coveredFn, } from \"./thing\";\ncoveredFn();\n",
  },);
  expect(code,).toBe(1,);
  // Full table-row form throughout: "#getValue" is a prefix of
  // "#getValueFactory", so a bare substring check would be ambiguous.
  expect(err,).toContain("| src/thing.ts#uncoveredFn |",);
  expect(err,).not.toContain("| src/thing.ts#coveredFn |",);
});

test("type exports are not gaps; enum, const, function and class are", () => {
  const { code, err, } = scanFixture({
    "src/kinds.ts": [
      "export interface SomeInterface {",
      "  a: string;",
      "}",
      "export type SomeType = string;",
      "export enum SomeEnum {",
      "  A,",
      "}",
      "export const SOME_CONST = 1;",
      "export function someFn() {",
      "  return 1;",
      "}",
      "export class SomeClass {",
      "  a = 1;",
      "}",
      "",
    ].join("\n",),
  },);
  expect(code,).toBe(1,);
  expect(err,).toContain("| src/kinds.ts#SomeEnum |",);
  expect(err,).toContain("| src/kinds.ts#SOME_CONST |",);
  expect(err,).toContain("| src/kinds.ts#someFn |",);
  expect(err,).toContain("| src/kinds.ts#SomeClass |",);
  expect(err,).not.toContain("| src/kinds.ts#SomeInterface |",);
  expect(err,).not.toContain("| src/kinds.ts#SomeType |",);
});

test("generated files and migrations yield no gaps, and the scan still ran", () => {
  const generated = "export const FROM_GENERATED = 1;\n";
  const { code, err, } = scanFixture({
    // Non-skipped sibling file: proves the scan was not simply inert.
    "src/kept.ts": "export const KEPT_SYMBOL = 1;\n",
    "src/db/schema.ts": generated,
    "src/db/schema-manifest.ts": generated,
    "src/db/schema-story.ts": generated,
    "src/db/migrations/001_init.ts": generated,
    "src/validation/db-schemas.ts": generated,
    "src/test-utils/insert-helpers.ts": generated,
  },);
  expect(code,).toBe(1,);
  expect(err,).toContain("| src/kept.ts#KEPT_SYMBOL |",);
  expect(err,).not.toContain("FROM_GENERATED",);
});

test("coverage is whole-word: getValueFactory does not cover getValue", () => {
  const { code, err, } = scanFixture({
    "src/words.ts": "export function getValue() {\n  return 1;\n}\nexport function getValueFactory() {\n  return 2;\n}\n",
    // Names only the LONGER identifier — a substring match would wrongly
    // mark getValue covered.
    "src/words.test.ts": "import { getValueFactory, } from \"./words\";\ngetValueFactory();\n",
  },);
  expect(code,).toBe(1,);
  expect(err,).toContain("| src/words.ts#getValue |",);
  expect(err,).not.toContain("| src/words.ts#getValueFactory |",);
});

test("an unreadable baseline fails closed rather than passing as zero known", () => {
  const files = { "src/thing.ts": "export function lonely() {\n  return 1;\n}\n", };
  const cases = [
    ["absent", null,],
    ["malformed", "{ not json",],
    ["jscpd-shaped scalar", '{"clones": 5}',],
    ["non-string entries", '{"gaps": [1, 2]}',],
  ];
  // Mapped to [label, code] pairs so a failure diff names WHICH baseline
  // shape regressed, without relying on an `expect(value, message)` form.
  expect(cases.map(([label, baseline,]) => [label, scanFixture(files, { baseline, },).code,],)).toEqual(
    cases.map(([label,],) => [label, 2,],),
  );
});

test("--write-baseline records exactly the measured gaps", () => {
  const { code, written, } = scanFixture({
    "src/thing.ts": "export function lonely() {\n  return 1;\n}\nexport function alsoLonely() {\n  return 2;\n}\n",
  }, { args: ["--write-baseline"], },);
  expect(code,).toBe(0,);
  expect(JSON.parse(written,).gaps,).toEqual(["src/thing.ts#alsoLonely", "src/thing.ts#lonely"],);
});
