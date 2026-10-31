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
 * afterEach safety net, so the default child logger survives the suite.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { type Logger, } from "../logger";
import {
  assertParamsWithinScope,
  isWithinScope,
  PathOutsideScopeError,
  resetScopeLogSourceForTests,
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
