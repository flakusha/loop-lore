// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the frontend-innerhtml-xss gate extension to CSS assignments.
 *
 * The gate previously scanned only `.innerHTML =` assignments. The extension
 * adds `.style.backgroundImage =` and `.style.cssText =` scanning so CSS
 * injection vectors are caught too.
 *
 * Resource contract:
 * - DISK: each test owns ONE `mkdtempSync` dir created atomically, so
 *   concurrent tests can never collide.
 * - TEARDOWN: `rmSync` is in `finally` and runs BEFORE the caller asserts.
 * - PROCESS: the gate runs in a spawned child, so module state is
 *   per-invocation.
 */
import { describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";

const SCRIPT = path.join(import.meta.dir, "check-frontend-innerhtml-xss.ts",);

function runGate(source: string,): { stdout: string; exitCode: number } {
  const dir = mkdtempSync(path.join(tmpdir(), "xss-gate-",),);
  try {
    writeFileSync(path.join(dir, "fixture.ts",), source,);
    const proc = Bun.spawnSync([process.execPath, SCRIPT, dir,],);
    return { stdout: proc.stdout.toString(), exitCode: proc.exitCode, };
  } finally {
    rmSync(dir, { recursive: true, force: true, },);
  }
}

describe("check-frontend-innerhtml-xss CSS extension", () => {
  test("reports unescaped interpolation in style.backgroundImage", () => {
    const out = runGate(
      'const el = document.createElement("div");\n  el.style.backgroundImage = `url(${untrusted})`;\n',
    );
    expect(out.exitCode,).toBe(1,);
    expect(out.stdout,).toContain("unsafe: ${untrusted}",);
    expect(out.stdout,).toContain("CSS-injection",);
  });

  test("reports unescaped interpolation in style.cssText", () => {
    const out = runGate(
      'const el = document.createElement("div");\n  el.style.cssText = `background: ${color}`;\n',
    );
    expect(out.exitCode,).toBe(1,);
    expect(out.stdout,).toContain("unsafe: ${color}",);
  });

  test("passes for escaped interpolation in style.backgroundImage", () => {
    const out = runGate(
      'const el = document.createElement("div");\n  el.style.backgroundImage = `url(${escapeHtml(url)})`;\n',
    );
    expect(out.exitCode,).toBe(0,);
  });

  test("passes for numeric literal in style.backgroundImage", () => {
    const out = runGate(
      'const el = document.createElement("div");\n  el.style.backgroundImage = `url(${index})`;\n',
    );
    expect(out.exitCode,).toBe(0,);
  });

  test("passes for a clean file with no assignments", () => {
    const out = runGate("const x = 1;\nexport { x };\n",);
    expect(out.exitCode,).toBe(0,);
  });
});
