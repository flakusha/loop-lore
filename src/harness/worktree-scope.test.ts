// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the worktree scope guard. Parallel-safe: every test builds its
 * own mkdtemp fixture and cleans it in afterEach, including failure paths.
 *
 * Resource contract: per-test mkdtemp dirs under tmpdir (removed in
 * afterEach on all paths); the module-global escalation log source is the
 * only shared seam — set only inside the one escalation test, restored via
 * `resetScopeLogSourceForTests()` in its finally AND in a describe-level
 * afterEach safety net, so the default child logger survives the suite. The
 * root-detection suite additionally chdirs (restored in finally) and resets
 * the memoized detected root via `resetScopeRootForTests()` in a
 * describe-level afterEach net; bun runs each test file in its own process
 * and tests in-file serially, so the process-global chdir cannot cross
 * suites.
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
  // Safety net: the memoized detected root and the one-shot warn flag must
  // never leak between tests, whatever a test's own failure path does.
  afterEach(() => {
    resetScopeRootForTests();
  },);

  test("detects the enclosing worktree root when no root is passed", async () => {
    resetScopeRootForTests();
    // bun test runs at a checkout root, so the detected `git rev-parse
    // --show-toplevel` is cwd or an ancestor of it — a fixture under
    // <cwd>/.tmp (gitignored scratch) is always inside the detected root.
    const scratch = join(process.cwd(), ".tmp",);
    mkdirSync(scratch, { recursive: true, },);
    const inside = mkdtempSync(join(scratch, "scope-detect-",),);
    try {
      // Create case: the file does not exist yet; nearest-existing-ancestor
      // resolution against the DETECTED root must allow it.
      await assertParamsWithinScope({
        toolName: "t",
        params: { path: join(inside, "created-by-tool.txt",), },
      },);

      const outside = mkdtempSync(join(tmpdir(), "scope-detect-out-",),);
      try {
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
        rmSync(outside, { recursive: true, force: true, },);
      }
    } finally {
      rmSync(inside, { recursive: true, force: true, },);
    }
  });

  test("falls back to process.cwd() and warns once when detection fails", async () => {
    resetScopeRootForTests();
    const outside = mkdtempSync(join(tmpdir(), "scope-detect-norepo-",),);
    const warns: WarnRecord[] = [];
    setScopeLogSourceForTests(() => makeRecordingLogger(warns,));
    const originalCwd = process.cwd();
    try {
      // tmpdir is not inside any git checkout: detection must fail.
      process.chdir(outside,);

      // Fallback root = cwd (= the fixture dir): a create-path under cwd is
      // allowed...
      await assertParamsWithinScope({
        toolName: "t",
        params: { path: join(outside, "local.txt",), },
      },);

      // ...and a path outside cwd escalates. Two calls, but exactly ONE
      // detection warn — the warn-once contract.
      await assertParamsWithinScope({
        toolName: "t",
        params: { file: join(originalCwd, "elsewhere.txt",), },
        requestRootChange: true,
      },);

      expect(warns.length,).toBe(2,);
      expect(warns[0]!.message,).toContain("detection failed",);
      expect(warns[0]!.meta,).toEqual({ cwd: outside, },);
      expect(warns[1]!.message,).toContain("requestRootChange",);
    } finally {
      process.chdir(originalCwd,);
      resetScopeRootForTests();
      resetScopeLogSourceForTests();
      rmSync(outside, { recursive: true, force: true, },);
    }
  });
});
