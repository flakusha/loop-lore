// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the worktree scope guard. Parallel-safe: every test builds its
 * own mkdtemp fixture and cleans it in afterEach, including failure paths.
 *
 * Resource contract: per-test mkdtemp dirs under tmpdir (removed in
 * afterEach on all paths); the module-global escalation log source and the
 * default-root detector are the only shared seams — each is set only inside
 * the one test that needs it and restored in that test's finally AND in a
 * describe-level afterEach safety net, so the defaults survive the suite.
 * bun runs each test file in its own process and tests in-file serially, so
 * the module-global seams cannot race across files.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { type Logger, } from "../logger";
import {
  assertParamsWithinScope,
  isWithinScope,
  PathOutsideScopeError,
  resetScopeLogSourceForTests,
  resetScopeRootForTests,
  resolveWithinScope,
  setScopeLogSourceForTests,
  setScopeRootDetectorForTests,
} from "./worktree-scope";

interface WarnRecord {
  message: string | Record<string, unknown>;
  meta: Record<string, unknown> | undefined;
}

/** Minimal recording logger capturing warn calls. */
function makeRecordingLogger(warns: WarnRecord[],): Logger {
  const self: Logger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: (message, meta,) => {
      warns.push({ message, meta, },);
    },
    error: () => {},
    fatal: () => {},
    child: () => self,
    addTransport: () => {},
    setBindings: () => {},
    setLevel: () => {},
    flush: () => Promise.resolve(),
  };

  return self;
}

describe("resolveWithinScope", () => {
  let root = "";
  let outside = "";
  let created: string[] = [];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "scope-root-",),);
    outside = mkdtempSync(join(tmpdir(), "scope-out-",),);
    created = [root, outside,];
  },);

  afterEach(() => {
    for (const dir of created) {
      rmSync(dir, { recursive: true, force: true, },);
    }
  },);

  test("accepts a path inside the scope root", async () => {
    writeFileSync(join(root, "inside.txt",), "x",);
    const resolved = await resolveWithinScope(root, "inside.txt",);
    expect(resolved,).toBe(join(root, "inside.txt",),);
  });

  test("rejects `../` traversal outside the root", async () => {
    writeFileSync(join(outside, "secret.txt",), "x",);
    const escape = join(root, "..", outside.split("/",).pop()!, "secret.txt",);
    try {
      await resolveWithinScope(root, escape,);
      expect.unreachable();
    } catch (error) {
      expect(error instanceof PathOutsideScopeError,).toBe(true,);
    }
  });

  test("rejects a symlink pointing outside the root", async () => {
    writeFileSync(join(outside, "target.txt",), "x",);
    symlinkSync(join(outside, "target.txt",), join(root, "link.txt",),);
    try {
      await resolveWithinScope(root, "link.txt",);
      expect.unreachable();
    } catch (error) {
      expect(error instanceof PathOutsideScopeError,).toBe(true,);
    }
  });

  test("accepts a symlink that stays inside the root", async () => {
    writeFileSync(join(root, "real.txt",), "x",);
    symlinkSync(join(root, "real.txt",), join(root, "alias.txt",),);
    const resolved = await resolveWithinScope(root, "alias.txt",);
    expect(resolved,).toBe(join(root, "real.txt",),);
  });

  test("rejects an intermediate dir-symlink with a missing final component", async () => {
    symlinkSync(outside, join(root, "link",),);
    try {
      await resolveWithinScope(root, join("link", "escape.txt",),);
      expect.unreachable();
    } catch (error) {
      expect(error instanceof PathOutsideScopeError,).toBe(true,);
    }
  });

  test("still allows a symlink inside the root with a missing final component", async () => {
    mkdirSync(join(root, "real-dir",),);
    symlinkSync(join(root, "real-dir",), join(root, "alias",),);
    const resolved = await resolveWithinScope(root, join("alias", "new.txt",),);
    expect(resolved,).toBe(join(root, "real-dir", "new.txt",),);
  });

  test("allows a deep not-yet-existing path with no existing components", async () => {
    const resolved = await resolveWithinScope(root, join("a", "b", "c.txt",),);
    expect(resolved,).toBe(join(root, "a", "b", "c.txt",),);
  });

  test("accepts a not-yet-existing path inside the root lexically", async () => {
    const resolved = await resolveWithinScope(root, join("new", "file.txt",),);
    expect(resolved,).toBe(join(root, "new", "file.txt",),);
  });
});

describe("isWithinScope", () => {
  test("mirrors resolveWithinScope as a boolean", async () => {
    const root = mkdtempSync(join(tmpdir(), "scope-bool-",),);
    try {
      expect(await isWithinScope(root, "ok.txt",),).toBe(true,);
      expect(await isWithinScope(root, join(root, "..",),),).toBe(false,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("rejects the same intermediate dir-symlink escape as a boolean", async () => {
    const root = mkdtempSync(join(tmpdir(), "scope-bool-link-",),);
    const outside = mkdtempSync(join(tmpdir(), "scope-bool-link-out-",),);
    try {
      symlinkSync(outside, join(root, "link",),);
      expect(await isWithinScope(root, join("link", "escape.txt",),),).toBe(false,);
      expect(await isWithinScope(root, join("inside-ok.txt",),),).toBe(true,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
      rmSync(outside, { recursive: true, force: true, },);
    }
  });
});

describe("assertParamsWithinScope", () => {
  let root = "";
  let outside = "";
  let created: string[] = [];

  // Safety net: even if an assertion throws before the test's own finally
  // runs, the module-global escalation log source must not stay silenced.
  afterEach(() => {
    resetScopeLogSourceForTests();
  },);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "scope-params-",),);
    outside = mkdtempSync(join(tmpdir(), "scope-params-out-",),);
    created = [root, outside,];
  },);

  afterEach(() => {
    for (const dir of created) {
      rmSync(dir, { recursive: true, force: true, },);
    }
  },);

  test("throws PathOutsideScopeError for an outside-scope path param", async () => {
    const outsideFile = join(outside, "x.txt",);
    try {
      await assertParamsWithinScope({ toolName: "t", params: { path: outsideFile, }, root, },);
      expect.unreachable();
    } catch (error) {
      expect(error instanceof PathOutsideScopeError,).toBe(true,);
    }
  });

  test("leaves non-path args untouched", async () => {
    await assertParamsWithinScope({
      toolName: "t",
      params: { content: outside, count: 3, nested: { path: outside, }, },
      root,
    },);
  });

  test("requestRootChange allows the crossing and logs it", async () => {
    const warns: WarnRecord[] = [];
    setScopeLogSourceForTests(() => makeRecordingLogger(warns,));
    try {
      const outsideFile = join(outside, "escalated.txt",);
      await assertParamsWithinScope({
        toolName: "writer",
        params: { file: outsideFile, },
        root,
        requestRootChange: true,
      },);

      expect(warns.length,).toBe(1,);
      expect(warns[0]!.message,).toContain("requestRootChange",);
      expect(warns[0]!.meta,).toEqual({
        tool: "writer",
        param: "file",
        path: outsideFile,
        root: process.cwd(),
      },);
    } finally {
      // Reinstate the module default — `() => null` would permanently
      // silence escalation logging for the rest of the process.
      resetScopeLogSourceForTests();
    }
  });
});

describe("detectScopeRoot (default root detection)", () => {
  // Safety net: the memoized detected root, the one-shot warn flag, and the
  // active detector must never leak between tests, whatever a test's own
  // failure path does.
  afterEach(() => {
    resetScopeRootForTests();
    setScopeRootDetectorForTests(null,);
  },);

  test("detects the enclosing worktree root when no root is passed", async () => {
    resetScopeRootForTests();
    // REAL detector, no injection. bun test runs at a checkout root, so the
    // detected `git rev-parse --show-toplevel` is cwd or an ancestor of it:
    // a fixture under <cwd>/.tmp (gitignored scratch) is inside the detected
    // root. If detection fails (no checkout), the cwd fallback keeps the
    // SAME fixture inside scope — so both outcomes allow the create path and
    // refuse tmpdir, making this test independent of the environment.
    const scratch = join(process.cwd(), ".tmp",);
    mkdirSync(scratch, { recursive: true, },);
    const inside = mkdtempSync(join(scratch, "scope-detect-",),);
    const outside = mkdtempSync(join(tmpdir(), "scope-detect-out-",),);
    try {
      // Create case: the file does not exist yet; nearest-existing-ancestor
      // resolution against the DETECTED root must allow it.
      await assertParamsWithinScope({
        toolName: "t",
        params: { path: join(inside, "created-by-tool.txt",), },
      },);

      try {
        await assertParamsWithinScope({
          toolName: "t",
          params: { path: join(outside, "x.txt",), },
        },);

        expect.unreachable();
      } catch (error) {
        expect(error instanceof PathOutsideScopeError,).toBe(true,);
      }
    } finally {
      rmSync(inside, { recursive: true, force: true, },);
      rmSync(outside, { recursive: true, force: true, },);
    }
  });

  test("warns once and falls back to process.cwd() when detection fails", async () => {
    resetScopeRootForTests();
    // Injected failure ("" = not detected): deterministic, no chdir needed.
    setScopeRootDetectorForTests(() => "");
    const warns: WarnRecord[] = [];
    setScopeLogSourceForTests(() => makeRecordingLogger(warns,));
    const scratch = join(process.cwd(), ".tmp",);
    mkdirSync(scratch, { recursive: true, },);
    const insideCwd = mkdtempSync(join(scratch, "scope-detect-cwd-",),);
    const outside = mkdtempSync(join(tmpdir(), "scope-detect-fail-",),);
    try {
      // Fallback root = cwd: a create-path under <cwd>/.tmp is allowed...
      await assertParamsWithinScope({
        toolName: "t",
        params: { path: join(insideCwd, "local.txt",), },
      },);

      // ...and a tmpdir path is refused. Two calls, but exactly ONE
      // detection warn — the warn-once contract.
      try {
        await assertParamsWithinScope({
          toolName: "t",
          params: { path: join(outside, "x.txt",), },
        },);

        expect.unreachable();
      } catch (error) {
        expect(error instanceof PathOutsideScopeError,).toBe(true,);
      }

      expect(warns.length,).toBe(1,);
      expect(warns[0]!.message,).toContain("detection failed",);
      expect(warns[0]!.meta,).toEqual({ cwd: process.cwd(), },);
    } finally {
      setScopeRootDetectorForTests(null,);
      resetScopeLogSourceForTests();
      rmSync(insideCwd, { recursive: true, force: true, },);
      rmSync(outside, { recursive: true, force: true, },);
    }
  });

  test("memoizes the detected root across guarded calls", async () => {
    resetScopeRootForTests();
    const injected = mkdtempSync(join(tmpdir(), "scope-detect-memo-",),);
    let calls = 0;
    setScopeRootDetectorForTests(() => {
      calls += 1;

      return injected;
    },);

    try {
      await assertParamsWithinScope({
        toolName: "t",
        params: { path: join(injected, "a.txt",), },
      },);

      await assertParamsWithinScope({
        toolName: "t",
        params: { path: join(injected, "b.txt",), },
      },);

      // The detector runs once; the second call reuses the memo.
      expect(calls,).toBe(1,);
    } finally {
      rmSync(injected, { recursive: true, force: true, },);
    }
  });
});
