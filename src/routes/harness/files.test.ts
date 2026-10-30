// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the sandbox file-tree endpoint (approach C,
 * epic-browser-editor-support): the admin guard denies it like every harness
 * endpoint, traversal/absolute paths are refused, and a symlink that escapes
 * the sandbox is skipped from listings instead of leaked. Fixtures follow the
 * `.tmp/` contract documented in `index.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, mock, } from "bun:test";
import { Elysia, } from "elysia";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, } from "node:fs";
import { join, resolve, } from "node:path";
import { setExecLogPath, } from "../../harness/exec-log";
import { getRun, } from "../../harness/query";
import type { HarnessRunRecord, } from "../../harness/types";
import { harnessRunFiles, } from "./files";
import { harnessRoutes, } from "./index";

const TMP_ROOT = ".tmp/harness-files-routes";

/** Branch name (no separators — the sandbox-root guard rejects them). */
const BRANCH = "files-fixture";

const RECORD: HarnessRunRecord = {
  runId: "run-1",
  ts: "2026-10-03T12:00:00Z",
  runMs: 900,
  task: "generate",
  taskType: "chat",
  model: "gpt-test",
  tools: ["read",],
  toolCount: 1,
  pattern: "agent.edit",
  patternDetail: "",
  result: "ok",
  error: null,
  toolingGap: null,
  costUsd: 0.01,
  tokensIn: 200,
  tokensOut: 100,
  branch: BRANCH,
  pid: 99,
  gitSha: "deadbee",
  msg: null,
  turnId: null,
};

let sandboxRoot = "";

function app(role: string | null,): Elysia {
  const built = new Elysia({},)
    .derive(() => ({ userId: "u1", userRole: role, }))
    .use(harnessRoutes(),);

  return built as unknown as Elysia;
}

function get(role: string | null, path: string,): Promise<Response> {
  return app(role,).handle(new Request(`http://localhost${path}`,),);
}

const REAL_QUERY = { getRun, };

function withRun(record: HarnessRunRecord | null,): void {
  mock.module("../../harness/query", () => ({
    ...REAL_QUERY,
    getRun: () => Promise.resolve(record,),
  }),);
}

/** Build the on-disk sandbox: one file, one dir, one escaping symlink. */
function makeSandbox(): string {
  const fixture = mkdtempSync(TMP_ROOT + "-",);
  const root = join(fixture, "tree", BRANCH,);
  mkdirSync(join(root, "sub",), { recursive: true, },);
  writeFileSync(join(root, "a.txt",), "hello",);
  writeFileSync(join(root, "sub", "inner.txt",), "x",);
  writeFileSync(join(fixture, "outside.txt",), "secret",);
  symlinkSync(join(fixture, "outside.txt",), join(root, "escape.txt",),);
  return fixture;
}

beforeEach(() => {
  mkdirSync(TMP_ROOT, { recursive: true, },);
  sandboxRoot = makeSandbox();
},);

afterEach(() => {
  rmSync(sandboxRoot, { recursive: true, force: true, },);
  setExecLogPath(null,);
  withRun(RECORD,);
},);

describe("GET /harness/runs/:runId/files", () => {
  it("denies a non-admin and an unauthenticated request", async () => {
    withRun(RECORD,);
    const path = `/api/v1/harness/runs/run-1/files`;
    expect((await get("user", path,)).status,).toBe(403,);
    expect((await get(null, path,)).status,).toBe(403,);
  });

  it("404s an unknown run", async () => {
    withRun(null,);
    const res = await get("admin", "/api/v1/harness/runs/nope/files",);
    expect(res.status,).toBe(404,);
  });

  /**
   * The route resolves the sandbox against the server cwd (the repo root),
   * which no test may write to; the read-only listing behaviors below run
   * through the same `harnessRunFiles` body against a fixture root.
   */
  it("404s a missing subdirectory", async () => {
    withRun(RECORD,);
    const res = await get("admin", "/api/v1/harness/runs/run-1/files?path=ghost",);
    expect(res.status,).toBe(404,);
  });
});

describe("harnessRunFiles (unit)", () => {
  /**
   * The route resolves the sandbox against the server cwd (the repo root),
   * which no test may write to — these unit calls exercise the same
   * `harnessRunFiles` body against a fixture root instead.
   */
  function files(relPath: string,): Promise<unknown> {
    return harnessRunFiles({
      runId: "run-1",
      relPath,
      repoRoot: sandboxRoot,
      getRun: () => Promise.resolve(RECORD,),
    },);
  }

  it("lists the sandbox root read-only, dirs first, skipping escapes", async () => {
    const out = await files("",) as {
      root: string;
      path: string;
      entries: Array<{ name: string; type: string; size: number }>;
    };

    expect(out.root,).toEndWith(`tree/${BRANCH}`,);
    expect(out.path,).toBe("",);
    const names = out.entries.map((e,) => e.name);
    expect(names,).toEqual(["sub", "a.txt",],);
    expect(out.entries[0]?.type,).toBe("dir",);
    expect(out.entries[1]?.size,).toBe(5,);
    expect(names,).not.toContain("escape.txt",);
  });

  it("lists a subdirectory", async () => {
    const out = await files("sub",) as { path: string; entries: Array<{ name: string }> };
    expect(out.path,).toBe("sub",);
    expect(out.entries.map((e,) => e.name),).toEqual(["inner.txt",],);
  });

  it("rejects `..` traversal and absolute paths", async () => {
    for (const rel of ["..", "/etc", "a.txt/../../..", "sub/../../outside.txt",]) {
      expect(await files(rel,),).toEqual({ kind: "escape", },);
    }
  });

  it("reports a missing subdirectory", async () => {
    expect(await files("ghost",),).toEqual({ kind: "not-found", },);
  });

  it("refuses a run without a branch or a missing worktree", async () => {
    const none = await harnessRunFiles({
      runId: "run-1",
      relPath: "",
      repoRoot: sandboxRoot,
      getRun: () => Promise.resolve({ ...RECORD, branch: null, },),
    },);

    expect(none,).toEqual({ kind: "no-sandbox", },);

    const gone = await harnessRunFiles({
      runId: "run-1",
      relPath: "",
      repoRoot: sandboxRoot,
      getRun: () => Promise.resolve({ ...RECORD, branch: "ghost-branch", },),
    },);

    expect(gone,).toEqual({ kind: "no-sandbox", },);
  });

  it("refuses a branch that escapes the tree/ directory", async () => {
    const out = await harnessRunFiles({
      runId: "run-1",
      relPath: "",
      repoRoot: sandboxRoot,
      getRun: () => Promise.resolve({ ...RECORD, branch: "..", },),
    },);

    expect(out,).toEqual({ kind: "no-sandbox", },);
  });

  it("resolves the sandbox relative to the given repo root", async () => {
    const ok = await harnessRunFiles({
      runId: "run-1",
      relPath: "",
      repoRoot: resolve(sandboxRoot,),
      getRun: () => Promise.resolve(RECORD,),
    },);

    expect(ok,).toMatchObject({ root: `tree/${BRANCH}`, path: "", },);
  });
});
