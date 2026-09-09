// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * check-db-schemas.smoke.test.ts
 *
 * BUG-check-db-schemas regression coverage. Verifies the three exit-code
 * categories the production script must distinguish for the dprint step:
 *
 *   1. dprint exit 0    → benign, fall through, continue.
 *   2. dprint exit 20   → "files reformatted" (dprint's documented code);
 *                         fall through, do NOT emit `[TOOLING ERROR]`.
 *   3. dprint exit 127  → binary missing or crash; emit `[TOOLING ERROR]`,
 *                         exit 1, never reach the diff loop.
 *
 * The smoke test exercises the classifier directly (the cheapest seam that
 * still asserts the production decision matrix) and an integration scenario
 * via `bun spawn` to confirm a real dprint invocation behaves as classified.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { dirname, join, resolve, } from "node:path";
import { fileURLToPath, } from "node:url";
import {
  classifyDprintExit,
  DPRINT_REFORMATTED_EXIT_CODE,
} from "./check-db-schemas";

const __dirname = dirname(fileURLToPath(import.meta.url,),);
const SCRIPT_PATH = resolve(__dirname, "check-db-schemas.ts",);

// ── Unit: classifier decision matrix ─────────────────────────

describe("classifyDprintExit", () => {
  test("status 20 → benign (dprint reformatted the file)", () => {
    const err = Object.assign(new Error("Command failed: dprint fmt",), {
      status: DPRINT_REFORMATTED_EXIT_CODE,
      stderr: Buffer.from("",),
    },);
    expect(classifyDprintExit(err,),).toBe("benign",);
  });

  test("status 127 → tooling (binary missing / crash)", () => {
    const err = Object.assign(new Error("Command failed: dprint",), {
      status: 127,
      stderr: Buffer.from("sh: dprint: command not found",),
    },);
    expect(classifyDprintExit(err,),).toBe("tooling",);
  });

  test("status 1 → tooling (generic dprint error)", () => {
    const err = Object.assign(new Error("Command failed: dprint fmt",), {
      status: 1,
      stderr: Buffer.from("error: invalid config",),
    },);
    expect(classifyDprintExit(err,),).toBe("tooling",);
  });

  test("no status property → tooling (signal kill, ENOENT, etc.)", () => {
    expect(classifyDprintExit(new Error("spawn ENOENT",),),).toBe("tooling",);
    expect(classifyDprintExit(null,),).toBe("tooling",);
    expect(classifyDprintExit(undefined,),).toBe("tooling",);
    expect(classifyDprintExit("plain string error",),).toBe("tooling",);
  });

  test("status !== 20 → tooling even when status is non-zero", () => {
    const err = Object.assign(new Error("Command failed",), { status: 2, },);
    expect(classifyDprintExit(err,),).toBe("tooling",);
  });
});

// ── Integration: real dprint invocation against a fixture tmp dir ──

const worktreeRoot = resolve(__dirname, "..", "..",);

describe("check-db-schemas smoke (bun spawn)", () => {
  let scratchDir: string;

  beforeAll(() => {
    scratchDir = mkdtempSync(join(tmpdir(), "check-db-schemas-smoke-",),);
    mkdirSync(join(scratchDir, "test-utils",), { recursive: true, },);
    mkdirSync(join(scratchDir, "validation",), { recursive: true, },);
  },);

  afterAll(() => {
    rmSync(scratchDir, { recursive: true, force: true, },);
  },);

  async function runScript(env: Record<string, string | undefined>,): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    const proc = Bun.spawn({
      cmd: ["bun", "run", SCRIPT_PATH,],
      cwd: worktreeRoot,
      env: { ...process.env, ...env, },
      stdout: "pipe",
      stderr: "pipe",
    },);
    const [stdout, stderr,] = await Promise.all([
      new Response(proc.stdout,).text(),
      new Response(proc.stderr,).text(),
    ],);
    const exitCode = await proc.exited;
    return { exitCode, stdout, stderr, };
  }

  test("clean checkout exits 0 (dprint exit 0 → fall through, all up-to-date)", async () => {
    const { exitCode, stdout, stderr, } = await runScript({
      DB_GEN_OUTPUT_DIR: join(worktreeRoot, "src", "db",),
    },);
    expect(stderr,).not.toContain("[TOOLING ERROR]",);
    expect(exitCode,).toBe(0,);
    expect(stdout,).toContain("All DB schemas up-to-date.",);
  });

  test("dprint exit 127 → tooling error", async () => {
    // Place a fake dprint that exits 127 alongside the scratch dir.
    // Prepending scratchDir to PATH makes bunx dprint find the fake first.
    writeFileSync(join(scratchDir, "dprint",), `#!/bin/sh\nexit 127\n`, { mode: 0o755, },);
    const { exitCode, stderr, } = await runScript({
      PATH: `${scratchDir}:${process.env.PATH ?? ""}`,
      DB_GEN_OUTPUT_DIR: scratchDir,
    },);
    expect(exitCode,).toBe(1,);
    expect(stderr,).toContain("[TOOLING ERROR]",);
    expect(stderr,).not.toContain("is STALE",);
  });
});
