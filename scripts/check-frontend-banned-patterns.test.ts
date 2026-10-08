// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The `listener-leak` page-lifetime exemption. Both halves of the rule are
 * asserted here because either half alone is wrong: receiver-only would hide
 * real component leaks, scope-only would keep reporting module top-level page
 * registrations that cannot leak.
 *
 * Resource contract — why this suite is parallel-safe:
 * - DISK: each `report()` call owns exactly ONE `mkdtempSync` dir, created
 *   atomically with a random suffix, so concurrent calls — in this process or
 *   in another `bun test` process — can never collide on the `fixture.ts` path.
 *   The fixture name is fixed, but only ever inside a per-call unique root.
 * - TEARDOWN: the `rmSync` is in `finally` and runs BEFORE the caller asserts,
 *   so a failed assertion cannot leak its dir into a sibling run.
 * - PROCESS: the checker runs in a spawned child, so its module-level
 *   accumulators (`buckets`, `suppressed`, `depth`) are per-invocation and
 *   cannot bleed between tests.
 * - No shared globals, no fixed paths, no ordering dependence.
 */
import { describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";

const SCRIPT = path.join(import.meta.dir, "check-frontend-banned-patterns.ts",);

function report(source: string,): string {
  const dir = mkdtempSync(path.join(tmpdir(), "banned-patterns-",),);
  try {
    writeFileSync(path.join(dir, "fixture.ts",), source,);
    return Bun.spawnSync([process.execPath, SCRIPT, dir,],).stdout.toString();
  } finally {
    rmSync(dir, { recursive: true, force: true, },);
  }
}

/** The `fixture.ts:line` keys listed under `listener-leak`. */
function leakKeys(out: string,): string[] {
  const body = out.split("## listener-leak",)[1]?.split("\n## ",)[0] ?? "";
  // Locations are ROOT-relative; the fixture lives outside ROOT, so keep the
  // trailing `fixture.ts:line` and drop whatever path leads up to it.
  return [...body.matchAll(/(?:\S*\/)?(fixture\.ts:\d+)/g,),].map((m,) => m[1]!);
}

describe("listener-leak page-lifetime exemption", () => {
  test("suppresses a page receiver registered at module top level", () => {
    const out = report('document.addEventListener("htmx:load", () => {},);\n',);
    expect(leakKeys(out,),).toEqual([],);
    expect(out,).toContain("suppressed: 1 page-lifetime",);
  });

  test("STILL reports a page receiver inside a component", () => {
    const out = report('function init(): void {\n  document.addEventListener("keydown", () => {},);\n}\n',);
    expect(leakKeys(out,),).toEqual(["fixture.ts:2",],);
    expect(out,).not.toContain("suppressed:",);
  });

  test("STILL reports a page receiver inside a class method", () => {
    const out = report('class C {\n  m(): void {\n    window.addEventListener("x", () => {},);\n  }\n}\n',);
    expect(leakKeys(out,),).toEqual(["fixture.ts:3",],);
  });

  test("STILL reports a page receiver inside a callback", () => {
    // Both lines are findings: the outer `el` add has no matching remove, and
    // the nested `document` add is a page receiver but not at top level.
    const out = report('el.addEventListener("x", () => {\n  document.addEventListener("y", () => {},);\n});\n',);
    expect(leakKeys(out,),).toEqual(["fixture.ts:1", "fixture.ts:2",],);
  });

  test("a component receiver is reported at any depth", () => {
    const out = report('const el = q();\nel.addEventListener("x", () => {},);\n',);
    expect(leakKeys(out,),).toEqual(["fixture.ts:2",],);
  });
});
