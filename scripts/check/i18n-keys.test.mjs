#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the i18n static-key gate: extraction rules, missing-key
 * detection, and the gate's exit-code contract.
 */
import { expect, test, } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
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
  const { code, } = runFixture({
    "src/public/locales/en.json": EN_JSON,
    "src/app.ts": 't("errors." + kind)\n',
  },);
  expect(code,).toBe(0,);
});

test("template literal keys are skipped", () => {
  const { code, } = runFixture({
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

test("runtime registry: every registered command resolves to a commands.<name> key", () => {
  // Runs the gate in-tree (cwd = project root) so the dynamic registry
  // import resolves the real command barrel. A registered command without
  // a catalog key must fail the gate — the palette renders t(key) raw.
  const proc = Bun.spawnSync(["bun", GATE,], {
    cwd: join(import.meta.dir, "..", "..",),
    stdout: "pipe",
    stderr: "pipe",
  },);
  const out = new TextDecoder().decode(proc.stdout,);
  if (proc.exitCode !== 0) { console.error("FAIL runtime-registry:", { code: proc.exitCode, out, },); }
  expect(proc.exitCode,).toBe(0,);
  expect(out,).toContain("all runtime commands keyed",);
});

test("runtime registry: gate source performs the runtime check", () => {
  // Guards against silent deletion of the registry-check block: the
  // static extractor skips template/concatenated keys and can never
  // see runtime-minted commands.<name> keys on its own.
  const gateSrc = readFileSync(GATE, "utf-8",);
  expect(gateSrc,).toContain("listCommands",);
});
