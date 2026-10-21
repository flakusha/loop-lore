// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Guard rails for the diff-scoped static gates in `gates.mjs`
 * (`pickScopedFiles`). Every case below is a way the narrowing could go wrong
 * and hand back a narrower list than the diff really justifies: null means
 * "run the FULL gate", and null is always the safe answer. No gate is spawned
 * here — the picker is a pure function over the changed-path list.
 */

import { expect, test, } from "bun:test";
import { pickScopedFiles, } from "./gates-scope.mjs";

const TS = /\.(ts|tsx|js|jsx|mjs|cjs|md)$/;
const MD = /\.md$/;
const all = () => true;
const none = () => false;

test("keeps only diff-touched files the gate can consume", () => {
  const picked = pickScopedFiles(
    ["src/a.ts", "docs/b.md", "src/public/logo.svg", "notes.txt",],
    TS,
    all,
  );
  expect(picked,).toEqual(["src/a.ts", "docs/b.md",],);
});

test("returns null when nothing matches — never an empty file list", () => {
  expect(pickScopedFiles(["src/public/logo.svg",], TS, all,),).toBeNull();
  expect(pickScopedFiles([], TS, all,),).toBeNull();
});

test("returns null when a config file changed: the rules themselves moved", () => {
  for (
    const breaker of [
      "eslint.config.mjs",
      "package.json",
      "tsconfig.json",
      ".markdownlint.json",
      ".markdownlint-cli2.jsonc",
    ]
  ) {
    expect(pickScopedFiles(["src/a.ts", breaker,], TS, all,), breaker,).toBeNull();
  }
});

test("drops files that no longer exist on disk (delete/rename)", () => {
  // A deleted .ts is in CHANGED_FILES and must not reach the command line —
  // eslint exits non-zero on a missing path, turning a green gate red.
  const picked = pickScopedFiles(
    ["src/gone.ts", "src/kept.ts",],
    TS,
    (f,) => f !== "src/gone.ts",
  );
  expect(picked,).toEqual(["src/kept.ts",],);
});

test("every file gone means the full gate, not zero files", () => {
  expect(pickScopedFiles(["src/gone.ts",], TS, none,),).toBeNull();
});

test("returns null on a path that could break out of the bash -c gate command", () => {
  expect(pickScopedFiles(["src/a.ts; rm -rf /",], TS, all,),).toBeNull();
  expect(pickScopedFiles(["src/a b.ts",], TS, all,),).toBeNull();
  expect(pickScopedFiles(["src/$(id).ts",], TS, all,),).toBeNull();
});

test("returns null past the command-line budget", () => {
  const many = Array.from({ length: 201, }, (_v, i,) => `src/f${i}.ts`,);
  expect(pickScopedFiles(many, TS, all,),).toBeNull();
  expect(pickScopedFiles(many.slice(1,), TS, all,),).toHaveLength(200,);
});

test("the md picker takes only markdown", () => {
  const picked = pickScopedFiles(["docs/a.md", "src/a.ts",], MD, all,);
  expect(picked,).toEqual(["docs/a.md",],);
});
