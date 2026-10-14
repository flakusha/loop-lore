#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the i18n static-key gate: extraction rules, missing-key
 * detection, and the gate's exit-code contract.
 */
import { expect, test, } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

const GATE = join(import.meta.dir, "i18n-keys.mjs",);

/**
 * Create a throwaway project fixture with src/ and en.json, copy the gate
 * in, run it, and return { code, stdout }.
 */
function runFixture(files,) {
  const root = mkdtempSync(join(tmpdir(), "i18n-keys-",),);
  try {
    const srcDir = join(root, "src",);
    mkdirSync(join(srcDir, "public", "locales",), { recursive: true, },);
    mkdirSync(join(srcDir, "components",), { recursive: true, },);
    for (const [name, content,] of Object.entries(files,)) {
      const full = join(root, name,);
      mkdirSync(join(full, "..",), { recursive: true, },);
      writeFileSync(full, content,);
    }
    const script = join(root, "scripts", "check", "i18n-keys.mjs",);
    mkdirSync(join(root, "scripts", "check",), { recursive: true, },);
    copyFileSync(GATE, script,);
    const proc = Bun.spawnSync(["bun", script,], { cwd: root, stdout: "pipe", stderr: "pipe", },);
    return {
      code: proc.exitCode,
      out: new TextDecoder().decode(proc.stdout,),
      err: new TextDecoder().decode(proc.stderr,),
    };
  } finally {
    rmSync(root, { recursive: true, force: true, },);
  }
}

const EN_JSON = JSON.stringify(
  {
    greetings: { hello: "Hello", },
    errors: { notFound: "Not found", },
  },
  null,
  2,
);

test("all keys resolve — exit 0", () => {
  const { code, out, err, } = runFixture({
    "src/public/locales/en.json": EN_JSON,
    "src/app.ts": 't("greetings.hello")\nt("errors.notFound")\n',
  },);
  if (code !== 0) { console.error("FAIL all-resolve:", { code, out, err, },); }
  expect(code,).toBe(0,);
  expect(out,).toContain("all",);
});

test("missing key — exit 1 with key listed", () => {
  const { code, out, } = runFixture({
    "src/public/locales/en.json": EN_JSON,
    "src/app.ts": 't("greetings.hello")\nt("errors.serverError")\n',
  },);
  expect(code,).toBe(1,);
  expect(out,).toContain("errors.serverError",);
});

test("concatenated keys are skipped (not static)", () => {
  const { code, out, } = runFixture({
    "src/public/locales/en.json": EN_JSON,
    "src/app.ts": 't("errors." + kind)\n',
  },);
  expect(code,).toBe(0,);
});

test("template literal keys are skipped", () => {
  const { code, out, } = runFixture({
    "src/public/locales/en.json": EN_JSON,
    "src/app.ts": "t(`errors.${kind}`)\n",
  },);
  expect(code,).toBe(0,);
});

test("ternary branches are both checked", () => {
  const { code, out, } = runFixture({
    "src/public/locales/en.json": EN_JSON,
    "src/app.ts": 't(isEdit ? "errors.notFound" : "errors.serverError")\n',
  },);
  expect(code,).toBe(1,);
  expect(out,).toContain("errors.serverError",);
});
