#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 317

// Pins the test-gap ratchet contract: an export no test file names is a gap
// and one a test does name is not; `export interface` / `export type` are not
// gaps while enum / const / function / class / let / var / abstract class are;
// the generated-file and migration paths yield no gaps at all; coverage
// matching is whole-word, so `getValueFactory` in a test does NOT cover
// `getValue`; and a baseline the gate cannot read fails closed instead of
// reading as zero-known gaps.
//
// The load-bearing cases are the two that used to make the gate toothless:
// common names appearing only inside a comment or a string, and a same-named
// export in a module no test imports, must both stay gaps. An export counts as
// covered only when a test that IMPORTS its defining module names it in real
// code — so coverage survives the src/ re-export graph.

import { expect, test, } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { dirname, join, } from "node:path";

const GATE = "test-gaps.mjs";
const BASELINE_REL = join("scripts", "check", "test-gaps-baseline.json",);

/** An empty baseline: every gap the scan finds is therefore a NEW gap. */
const NO_GAPS = JSON.stringify({ generatedAt: "1970-01-01T00:00:00.000Z", count: 0, gaps: [], },);

/** The 14 common names an untested module used to hide behind. */
const COMMON_NAMES = [
  "format",
  "get",
  "handle",
  "helper",
  "init",
  "load",
  "map",
  "parse",
  "reset",
  "run",
  "save",
  "start",
  "update",
  "validate",
];

const fn = (name,) => `export function ${name}() {\n  return 1;\n}\n`;

/**
 * One throwaway repo root per call, holding `files` (repo-relative path →
 * content) and a copy of the gate at scripts/check/ — the gate resolves its
 * own repo root and default baseline from `import.meta.dir`, so it has to run
 * from inside the fixture. `baseline` is written verbatim (null leaves the
 * file absent). Removed in `finally` so a failed assertion cannot leak it.
 *
 * RESOURCE CONTRACT — what each call owns, and why the suite is parallel-safe:
 * - DISK: exactly one `mkdtempSync` root per call, named `test-gaps-XXXXXX`.
 *   mkdtemp creates the random suffix atomically, so concurrent calls — in
 *   this process or in another `bun test` process — can never collide on a
 *   fixed fixture path. Nothing outside that root is written; the gate's own
 *   `baseline.<pid>.tmp` lands inside it too.
 * - PROCESS: one `Bun.spawnSync(["bun", "run", script, …])` per call, cwd
 *   pinned to the fixture root. The gate never reads process.argv from the
 *   importer and never touches the ambient environment, so no state crosses
 *   the boundary.
 * - NO shared mutable state: no fixed paths, no ports, no DB or collection
 *   names, no globals, no env mutation, no module-level cache the gate could
 *   observe. Tests are order-independent and pass in isolation.
 * - TEARDOWN: the `rmSync` is in `finally` and runs BEFORE the caller asserts,
 *   so a leaked fixture cannot outlive even a failing assertion. Verified: 6
 *   concurrent copies of this file pass with 0 fixture dirs left in TMPDIR,
 *   and `--rerun-each 3` (42 runs) leaves 0.
 * - The one thing shared across calls is READ-ONLY: this file's sibling
 *   `test-gaps.mjs`, copied into each fixture. Concurrent formatters
 *   rewriting it mid-run would be a hazard, but nothing in the verify path
 *   formats while tests execute.
 *
 * COST: each call spawns a fresh bun (~30-50 ms). The 14 tests make 19 spawns
 * and the whole file runs in ~150 ms serially, well inside a pre-commit hook.
 *
 * Returns the exit code, both streams, and the baseline file as it stands
 * after the run (null when absent) so the write path is assertable.
 */
function scanFixture(files, { baseline = NO_GAPS, args = [], } = {},) {
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
    "src/thing.test.ts": 'import { coveredFn, } from "./thing";\ncoveredFn();\n',
  },);
  expect(code,).toBe(1,);
  // Full table-row form throughout: "#getValue" is a prefix of
  // "#getValueFactory", so a bare substring check would be ambiguous.
  expect(err,).toContain("| src/thing.ts#uncoveredFn |",);
  expect(err,).not.toContain("| src/thing.ts#coveredFn |",);
});

test("type exports are not gaps; enum, const, function, class, let, var and abstract class are", () => {
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
      "export let someMutable = 1;",
      "export var someLegacy = 1;",
      "export abstract class SomeAbstract {",
      "  abstract run(): void;",
      "}",
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
  for (
    const name of [
      "SomeEnum",
      "SOME_CONST",
      "someMutable",
      "someLegacy",
      "SomeAbstract",
      "someFn",
      "SomeClass",
    ]
  ) { expect(err,).toContain(`| src/kinds.ts#${name} |`,); }
  expect(err,).not.toContain("| src/kinds.ts#SomeInterface |",);
  expect(err,).not.toContain("| src/kinds.ts#SomeType |",);
});

test("a local export list is a gap; a re-export list and export default are not", () => {
  const { code, err, } = scanFixture({
    "src/barrel.ts": [
      "const localA = 1;",
      "const localB = 2;",
      "export { localA, localB };",
      'export { somethingElse } from "./other";',
      "export default function notNamed() {",
      "  return 1;",
      "}",
      "",
    ].join("\n",),
    "src/other.ts": "export const somethingElse = 3;\n",
  },);
  expect(code,).toBe(1,);
  expect(err,).toContain("| src/barrel.ts#localA |",);
  expect(err,).toContain("| src/barrel.ts#localB |",);
  // `from "./other"` charges OTHER with the symbol; `default` names no binding.
  expect(err,).toContain("| src/other.ts#somethingElse |",);
  expect(err,).not.toContain("| src/barrel.ts#somethingElse |",);
  expect(err,).not.toContain("notNamed",);
});

test("a local export list reports the exported name, not the local binding", () => {
  const { code, err, } = scanFixture({
    "src/aliased.ts": "const inner = 1;\nexport { inner as publicName };\n",
  },);
  expect(code,).toBe(1,);
  expect(err,).toContain("| src/aliased.ts#publicName |",);
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
    "src/words.ts":
      "export function getValue() {\n  return 1;\n}\nexport function getValueFactory() {\n  return 2;\n}\n",
    // Names only the LONGER identifier — a substring match would wrongly
    // mark getValue covered.
    "src/words.test.ts": 'import { getValueFactory, } from "./words";\ngetValueFactory();\n',
  },);
  expect(code,).toBe(1,);
  expect(err,).toContain("| src/words.ts#getValue |",);
  expect(err,).not.toContain("| src/words.ts#getValueFactory |",);
});

test("common names mentioned only in a comment or a string are still gaps", () => {
  const { code, err, } = scanFixture({
    "src/gate-probe-check/probe.ts": COMMON_NAMES.map(fn,).join("",),
    // Every one of those names appears in the corpus — as a line comment, as
    // a string literal, and inside a block comment. None of it is code that
    // touches the probe module, which no test imports at all.
    "src/unrelated.test.ts": [
      `// ${COMMON_NAMES.join(" ",)}`,
      `const label = "${COMMON_NAMES.join(" ",)}";`,
      `/* ${COMMON_NAMES.join(" ",)} */`,
      "",
    ].join("\n",),
  },);
  expect(code,).toBe(1,);
  for (const name of COMMON_NAMES) {
    expect(err,).toContain(`| src/gate-probe-check/probe.ts#${name} |`,);
  }
});

test("a same-named export in a module NO test imports is not covered by another module's test", () => {
  const { code, err, } = scanFixture({
    "src/alpha/store.ts": fn("load",),
    "src/beta/store.ts": fn("load",),
    // Imports alpha's ./store, so alpha#load is covered — beta#load is not.
    "src/alpha/store.test.ts": 'import { load, } from "./store";\nload();\n',
  },);
  expect(code,).toBe(1,);
  expect(err,).toContain("| src/beta/store.ts#load |",);
  expect(err,).not.toContain("| src/alpha/store.ts#load |",);
});

test("coverage survives the src/ re-export graph: a barrel-imported symbol still counts", () => {
  const { code, err, } = scanFixture({
    "src/deep/impl.ts":
      "export function realThing() {\n  return 1;\n}\nexport function untestedThing() {\n  return 2;\n}\n",
    // The barrel re-publishes both symbols; the test uses only one of them.
    "src/deep/index.ts": 'export { realThing, untestedThing, } from "./impl";\n',
    "src/user.test.ts": 'import { realThing, } from "./deep";\nrealThing();\n',
  },);
  expect(code,).toBe(1,);
  expect(err,).toContain("| src/deep/impl.ts#untestedThing |",);
  expect(err,).not.toContain("| src/deep/impl.ts#realThing |",);
});

test("a type-only import does not reach the module's runtime exports", () => {
  const { code, err, } = scanFixture({
    "src/deep/impl.ts": "export function realThing() {\n  return 1;\n}\n",
    // The name appears in the import clause, but `import type` loads nothing —
    // so realThing was never executed by any test and stays a gap.
    "src/typed.test.ts": 'import type { realThing, } from "./deep/impl";\nexport type { realThing, };\n',
  },);
  expect(code,).toBe(1,);
  expect(err,).toContain("| src/deep/impl.ts#realThing |",);
});

test("an unreadable baseline fails closed rather than passing as zero known", () => {
  const files = { "src/thing.ts": fn("lonely",), };
  const cases = [
    ["absent", null,],
    ["malformed", "{ not json",],
    ["jscpd-shaped scalar", '{"clones": 5}',],
    ["non-string entries", '{"gaps": [1, 2]}',],
  ];
  // Mapped to [label, code] pairs so a failure diff names WHICH baseline
  // shape regressed, without relying on an `expect(value, message)` form.
  expect(cases.map(([label, baseline,],) => [label, scanFixture(files, { baseline, },).code,]),).toEqual(
    cases.map(([label,],) => [label, 2,]),
  );
});

test("--write-baseline records exactly the measured gaps", () => {
  const { code, written, } = scanFixture({
    "src/thing.ts": "export function lonely() {\n  return 1;\n}\nexport function alsoLonely() {\n  return 2;\n}\n",
  }, { args: ["--write-baseline", "--accept-new-debt",], },);
  expect(code,).toBe(0,);
  expect(JSON.parse(written,).gaps,).toEqual(["src/thing.ts#alsoLonely", "src/thing.ts#lonely",],);
});

test("shrinking the baseline needs no flag; accepting new debt does", () => {
  const files = { "src/thing.ts": fn("lonely",), };
  const wide = JSON.stringify({
    generatedAt: "1970-01-01T00:00:00.000Z",
    count: 2,
    gaps: ["src/thing.ts#lonely", "src/thing.ts#stale",],
  },);
  const shrink = scanFixture(files, { args: ["--write-baseline",], baseline: wide, },);
  expect(shrink.code,).toBe(0,);
  expect(JSON.parse(shrink.written ?? "null",).gaps,).toEqual(["src/thing.ts#lonely",],);

  const grow = scanFixture(files, { args: ["--write-baseline",], baseline: NO_GAPS, },);
  expect(grow.code,).toBe(2,);
  expect(grow.err,).toContain("--accept-new-debt",);

  const accepted = scanFixture(files, {
    args: ["--write-baseline", "--accept-new-debt",],
    baseline: NO_GAPS,
  },);
  expect(accepted.code,).toBe(0,);
  expect(JSON.parse(accepted.written ?? "null",).gaps,).toEqual(["src/thing.ts#lonely",],);
});

test("a first write with no baseline on disk is not treated as accepting debt", () => {
  const { code, written, } = scanFixture({ "src/thing.ts": fn("lonely",), }, {
    args: ["--write-baseline",],
    baseline: null,
  },);
  expect(code,).toBe(0,);
  expect(JSON.parse(written ?? "null",).gaps,).toEqual(["src/thing.ts#lonely",],);
});
