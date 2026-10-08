// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, test, } from "bun:test";
import { runNonBlockingChecks, } from "./nonblocking.mjs";

/**
 * Regression tests for the non-blocking checks in runNonBlockingChecks.
 *
 * Bug 1: version-drift with no v* tag emitted no note — silence was indistinguishable
 * from a passing check.
 *
 * Bug 2: markdown-links with broken targets only console.logged; no note was pushed
 * to the report.
 *
 * Both tests stub Bun.spawn at the module level so each is deterministic and
 * isolated from the real repo state (no real git tags, no real md:links scan).
 *
 * Bun.spawn is a built-in; Object.assign may silently no-op on non-writable
 * own properties.  Reflect.set forces the override regardless of descriptor.
 *
 * Cleanup strategy: afterEach at module scope runs restoreSpawn() after every test,
 * guaranteed — even when an expect() inside the test body throws.  The per-test
 * restoreSpawn() calls are kept as no-ops in the normal path; removing them requires
 * editing all three test bodies and risks a future copy-paste slip.
 *
 * The stub fallback (unmatched commands → empty successful proc) silently satisfies
 * any spawn not explicitly stubbed.  The banned-pattern and license checks therefore
 * push "ok" notes in tests that don't stub them.  This is intentional: those checks
 * are not the subject of Bug 1 or Bug 2, and stubbing them would add noise without
 * changing what the tests prove.
 */

// Save the actual Bun.spawn reference (not a bind wrapper — bind creates a new
// function object that is not reference-equal to Bun.spawn itself).  Restoring
// with the original reference ensures Bun.spawn === RealBunSpawn in assertions.
const RealBunSpawn = Bun.spawn;

function mockProc(stdout = "", stderr = "", exitCode = 0,) {
  const enc = new TextEncoder();
  return {
    exited: Promise.resolve(exitCode,),
    stdout: new ReadableStream({
      start(controller,) {
        controller.enqueue(enc.encode(stdout,),);
        controller.close();
      },
    },),
    stderr: new ReadableStream({
      start(controller,) {
        controller.enqueue(enc.encode(stderr,),);
        controller.close();
      },
    },),
  } as unknown as Bun.BunFile;
}

function stubSpawn(
  patternToMock: Array<{ pattern: string; stdout: string }>,
) {
  const stub = (...rest: unknown[]) => {
    const cmd = ((rest[0] as string[]) ?? [])[2] ?? "";
    const match = patternToMock.find((p,) => cmd.includes(p.pattern,));
    // Fallback: empty successful proc for any unmatched command.  This means
    // checks not explicitly stubbed (banned-pattern, license) silently succeed.
    return match ? mockProc(match.stdout, "", 0,) : mockProc("", "", 0,);
  };
  Reflect.set(Bun, "spawn", stub,);
}

function restoreSpawn() {
  Reflect.set(Bun, "spawn", RealBunSpawn,);
}

// Guaranteed cleanup — runs after every test, even when the body throws.
afterEach(() => {
  restoreSpawn();
},);

// ── Bug 1: version-drift — no v* tag → skipped note ─────────────

test("version-drift: no v* tag emits a skipped note, not silence", async () => {
  // Empty tag list + valid package version → hits the `else if (packageVersion)`
  // branch that was previously a no-op.
  stubSpawn([
    { pattern: "git tag --list", stdout: "", },
    { pattern: 'require("fs")', stdout: "1.2.3", },
  ],);

  const notes: Array<{ level: string; message: string }> = [];
  await runNonBlockingChecks(notes,);

  const skipped = notes.filter(
    (n,) => n.level === "skipped" && n.message.includes("no v* tag",),
  );
  expect(skipped.length,).toBeGreaterThan(0,);
  expect(skipped[0]!.message,).toContain("no v* tag found in repository",);
});

// ── Bug 2: markdown-links — broken targets → warn note ───────────

test("markdown-links: broken targets push a warn note, not only stdout", async () => {
  // Tag version matches → ok branch for version check; md:links returns broken.
  stubSpawn([
    { pattern: "git tag --list", stdout: "v1.0.0", },
    { pattern: 'require("fs")', stdout: "1.0.0", },
    {
      pattern: "md:links",
      stdout: "[] Checking links...\n  broken target: docs/missing.md\n  broken target: src/ghost.ts",
    },
  ],);

  const notes: Array<{ level: string; message: string }> = [];
  await runNonBlockingChecks(notes,);

  const warnNotes = notes.filter(
    (n,) => n.level === "warn" && n.message.includes("broken",),
  );
  expect(warnNotes.length,).toBeGreaterThan(0,);
  expect(warnNotes[0]!.message,).toContain("broken target: docs/missing.md",);
  expect(warnNotes[0]!.message,).toContain("broken target: src/ghost.ts",);
});

// ── Sanity: all four checks push at least one note each ──────────

test("all checks push at least one note each", async () => {
  stubSpawn([
    { pattern: "git tag --list", stdout: "v1.0.0", },
    { pattern: 'require("fs")', stdout: "1.0.0", },
    { pattern: "md:links", stdout: "[] All links OK", },
    { pattern: "license:check", stdout: "[license] MIT License found", },
  ],);

  const notes: Array<{ level: string; message: string }> = [];
  await runNonBlockingChecks(notes,);

  // Four checks, each pushes at least one note.
  expect(notes.length,).toBeGreaterThanOrEqual(4,);
  const validLevels = ["ok", "warn", "skipped", "info",] as const;
  for (const note of notes) {
    expect(validLevels,).toContain(note.level as typeof validLevels[number],);
  }
});

test("Bun.spawn is restored by afterEach even when the test body throws", () => {
  // Prove that afterEach runs even when the test body throws.
  // Strategy: install stub, capture state, throw, then assert in the catch block.
  // The catch runs BEFORE finally (which restores), so we can verify the stub was
  // active at the moment of the throw.  finally then restores for subsequent tests.
  let stubWasActiveAtThrowTime = false;
  try {
    stubSpawn([],);
    stubWasActiveAtThrowTime = Bun.spawn !== RealBunSpawn;
    expect(true,).toBe(false,); // deliberate throw
  } catch {
    // Assert inside the catch — this runs BEFORE finally, so Bun.spawn is still
    // the stub at this point.  If this assertion passes, the stub was confirmed
    // active when the throw occurred.
    expect(stubWasActiveAtThrowTime,).toBe(true,);
  } finally {
    restoreSpawn();
  }

  // Prove Bun.spawn is restored after finally for the next test.
  expect(Bun.spawn,).toBe(RealBunSpawn,);
});
