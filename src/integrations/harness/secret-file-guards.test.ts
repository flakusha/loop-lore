// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Secret-file guards on the two ACP read paths: a permission ask naming a
 * secret file never reaches auto-allow, and the fs/read_text_file bridge never
 * opens one.
 *
 * Resource contract (parallel-safe): every test owns a fresh mkdtemp sandbox
 * under .tmp/, removed in afterEach. No ports, no subprocess, no shared state.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { JsonRpcRequestError, } from "./jsonrpc-process";
import { classifyPermission, } from "./permission-policy";
import { readSandboxedText, writeSandboxedText, } from "./runtime";

/** Scratch parent under the repo's .tmp/ (same convention as sibling tests). */
const TMP_ROOT = ".tmp/harness-secret-guards";

/** Sandboxes created by the current test; removed after each. */
const dirs: string[] = [];

/** Create a fresh per-test sandbox root. */
function sandbox(): string {
  mkdirSync(TMP_ROOT, { recursive: true, },);
  const dir = mkdtempSync(join(TMP_ROOT, "case-",),);
  dirs.push(dir,);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) { rmSync(dirs.pop() ?? "", { recursive: true, force: true, },); }
},);

/** Build `session/request_permission`-shaped params for one path. */
function readAsk(path: string,): unknown {
  return { sessionId: "s-1", toolCall: { toolCallId: "call-1", title: path, rawInput: { path, }, }, };
}

describe("secret basenames never auto-allow", () => {
  it("auto-allows a normal read but requires approval for env.yaml", async () => {
    const root = sandbox();
    writeFileSync(join(root, "notes.txt",), "hello",);
    writeFileSync(join(root, "env.yaml",), "auth:\n  adminPassword: s3cret\n",);

    const ok = await classifyPermission({ params: readAsk("notes.txt",), kind: "read", sandboxRoot: root, },);
    expect(ok.decision,).toBe("auto_allow",);

    const denied = await classifyPermission({ params: readAsk("env.yaml",), kind: "read", sandboxRoot: root, },);
    expect(denied.decision,).toBe("require_approval",);
    expect(denied.reason,).toContain("env.yaml",);
  });
});

describe("secret basenames never reach the read bridge", () => {
  it("refuses env.yaml but still reads a normal file", async () => {
    const root = sandbox();
    writeFileSync(join(root, "env.yaml",), "auth:\n  adminPassword: s3cret\n",);
    writeFileSync(join(root, "notes.txt",), "hello",);

    await expect(readSandboxedText(root, "env.yaml",),).rejects.toBeInstanceOf(JsonRpcRequestError,);
    expect(await readSandboxedText(root, "notes.txt",),).toBe("hello",);
  });

  it("refuses a symlink alias to env.yaml on both bridges", async () => {
    const root = sandbox();
    writeFileSync(join(root, "env.yaml",), "s3cret",);
    symlinkSync(join(root, "env.yaml",), join(root, "notes-link.txt",),);

    await expect(readSandboxedText(root, "notes-link.txt",),).rejects.toBeInstanceOf(JsonRpcRequestError,);
    await expect(writeSandboxedText(root, "notes-link.txt", "overwrite",),)
      .rejects.toBeInstanceOf(JsonRpcRequestError,);

    expect(readFileSync(join(root, "env.yaml",), "utf8",),).toBe("s3cret",);
  });
});
