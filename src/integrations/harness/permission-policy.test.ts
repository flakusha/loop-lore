// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * permission-policy tests: the fail-closed auto-allow classifier.
 *
 * Resource contract (parallel-safe): every test owns a `mkdtempSync` sandbox
 * under the shared `.tmp/` parent, removed in `afterEach`. The scope check
 * runs real `fs.realpath` against that directory; no ports, no subprocess,
 * no shared globals, order-independent.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { classifyPermission, } from "./permission-policy";

/** Shared parent for per-test sandboxes (the repo's .tmp scratchpad). */
const TMP_ROOT = ".tmp/harness-permission-policy";

/** Sandboxes created by the current test; removed after each. */
const sandboxes: string[] = [];

/** Create a fresh sandbox root and register it for teardown. */
function sandbox(): string {
  const dir = mkdtempSync(TMP_ROOT,);
  sandboxes.push(dir,);
  return dir;
}

afterEach(() => {
  while (sandboxes.length > 0) { rmSync(sandboxes.pop() ?? "", { recursive: true, force: true, },); }
},);

/** Build `session/request_permission`-shaped params. */
function askParams(rawInput: Record<string, unknown>,): unknown {
  return {
    sessionId: "s-1",
    toolCall: { toolCallId: "call-1", title: "note.md", rawInput, },
  };
}

describe("classifyPermission (fail-closed)", () => {
  it("auto-allows a read-only kind whose path stays inside the sandbox", async () => {
    const root = sandbox();
    const verdict = await classifyPermission({
      params: askParams({ path: "notes.md", },),
      kind: "read",
      sandboxRoot: root,
    },);

    expect(verdict.decision,).toBe("auto_allow",);
  });

  it("auto-allows search and fetch inside the sandbox", async () => {
    const root = sandbox();
    for (const kind of ["search", "fetch",]) {
      const verdict = await classifyPermission({
        params: askParams({ path: "sub/dir.txt", pattern: "x", },),
        kind,
        sandboxRoot: root,
      },);

      expect(verdict.decision,).toBe("auto_allow",);
    }
  });

  it("requires approval when a read-only path escapes the sandbox", async () => {
    const root = sandbox();
    const verdict = await classifyPermission({
      params: askParams({ path: "/etc", },),
      kind: "read",
      sandboxRoot: root,
    },);

    expect(verdict.decision,).toBe("require_approval",);
  });

  it("requires approval on a `..` traversal out of the sandbox", async () => {
    const root = sandbox();
    const verdict = await classifyPermission({
      params: askParams({ path: "../outside.txt", },),
      kind: "read",
      sandboxRoot: root,
    },);

    expect(verdict.decision,).toBe("require_approval",);
  });

  it("requires approval for every write/exec kind even inside the sandbox", async () => {
    const root = sandbox();
    for (const kind of ["edit", "delete", "move", "execute", "other",]) {
      const verdict = await classifyPermission({
        params: askParams({ path: "notes.md", },),
        kind,
        sandboxRoot: root,
      },);

      expect(verdict.decision,).toBe("require_approval",);
    }
  });

  it("requires approval for an unknown or missing kind", async () => {
    const root = sandbox();
    for (const kind of ["teleport", null,]) {
      const verdict = await classifyPermission({
        params: askParams({ path: "notes.md", },),
        kind,
        sandboxRoot: root,
      },);

      expect(verdict.decision,).toBe("require_approval",);
    }
  });

  it("requires approval when a filesystem ask carries no verifiable path", async () => {
    const root = sandbox();
    const verdict = await classifyPermission({
      params: { sessionId: "s-1", },
      kind: "read",
      sandboxRoot: root,
    },);

    expect(verdict.decision,).toBe("require_approval",);
  });

  it("auto-allows the fs-free think kind regardless of params", async () => {
    const root = sandbox();
    const verdict = await classifyPermission({
      params: {},
      kind: "think",
      sandboxRoot: root,
    },);

    expect(verdict.decision,).toBe("auto_allow",);
  });

  it("requires approval when params nest deeper than the walk budget", async () => {
    const root = sandbox();
    // Seven nested objects: the depth-6 walk cannot see the innermost string.
    let deep: unknown = { path: "notes.md", };
    for (let i = 0; i < 7; i += 1) { deep = { nested: deep, }; }
    const verdict = await classifyPermission({
      params: { toolCall: { rawInput: deep, }, },
      kind: "read",
      sandboxRoot: root,
    },);

    expect(verdict.decision,).toBe("require_approval",);
  });
});
