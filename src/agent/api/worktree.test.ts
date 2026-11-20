// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Worktree spawn + sandbox + idle sweep. Route cases use an injected spawn
 * seam (no real git), and one deterministic case exercises the real
 * TTY-free `git worktree add` path against a throwaway repository.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { mkdtemp, rm, stat, writeFile, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { AgentTokenScope, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createRateLimiter, } from "../../middleware/rate-limit";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { cleanupIdleWorktrees, } from "../cleanup";
import { mintAgentToken, } from "./auth";
import {
  AgentWorktreeError,
  gitWorktreeAdd,
  gitWorktreeRemove,
  worktreeRoutes,
} from "./worktree";

const PREFIX = "/api/v1";
let fixture: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  createLogger({ level: "error", },);
  fixture = await createTestDb();
  db = fixture.db;
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

async function tokenWithWorktreeScope(): Promise<{ id: string; raw: string }> {
  const id = crypto.randomUUID();
  const { raw, hash, } = mintAgentToken();
  await db.insertInto("agent_tokens",).values({ id, token_hash: hash, scope: AgentTokenScope.Worktree, },).execute();
  return { id, raw, };
}

function makeApp(opts: {
  spawn?: (args: { path: string; branch: string },) => Promise<void>;
} = {},) {
  return new Elysia({ name: `test-agent-worktree-${crypto.randomUUID()}`, },).use(worktreeRoutes({
    database: db,
    repoRoot: "/tmp/loop-lore-agent-worktree",
    perTokenLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 100, },),
    globalLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 100, },),
    spawnWorktree: opts.spawn ?? (async () => {
      // Route cases assert the DB row; the real git path has its own case.
    }),
    measureDirectoryBytes: async () => 1_024,
  }, PREFIX,),);
}

async function post(token: string, app = makeApp(), branch = "agent/task",): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${PREFIX}/agent/worktrees`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", },
      body: JSON.stringify({ branch, },),
    },),
  );
}

async function registerWorktree(tokenId: string,): Promise<string> {
  const id = crypto.randomUUID();
  await db.insertInto("rsi_agent_worktrees",).values({
    id,
    token_id: tokenId,
    branch: `agent/${id.slice(0, 8,)}`,
    path: `/tmp/agent-${id}`,
  },).execute();

  return id;
}

describe("POST /agent/worktrees", () => {
  test("returns worktreeId/path/branch and registers the row", async () => {
    const token = await tokenWithWorktreeScope();
    const res = await post(token.raw,);
    expect(res.status,).toBe(201,);
    const { data, } = await res.json() as { data: { worktreeId: string; path: string; branch: string } };
    expect(data.worktreeId,).toMatch(/^[0-9a-f-]{36}$/,);
    expect(data.path,).toContain(`tree/agent-${data.worktreeId}`,);
    expect(data.branch,).toBe("agent/task",);
    const row = await db.selectFrom("rsi_agent_worktrees",).selectAll().where("id", "=", data.worktreeId,)
      .executeTakeFirst();

    expect(row?.token_id,).toBe(token.id,);
  });

  test("rejects option-like refs before spawning", async () => {
    const token = await tokenWithWorktreeScope();
    expect((await post(token.raw, makeApp(), "--upload-pack=x",)).status,).toBe(400,);
  });

  test("the 6th concurrent worktree for one token is 429", async () => {
    const token = await tokenWithWorktreeScope();
    for (let i = 0; i < 5; i++) { await registerWorktree(token.id,); }
    expect((await post(token.raw,)).status,).toBe(429,);
  });

  test("the 11th worktree globally is 429 even for a fresh token", async () => {
    const owner = await tokenWithWorktreeScope();
    for (let i = 0; i < 10; i++) { await registerWorktree(owner.id,); }
    const fresh = await tokenWithWorktreeScope();
    expect((await post(fresh.raw,)).status,).toBe(429,);
  });

  test("a pinentry stop surfaces 503 with a gpg-unlock hint", async () => {
    const token = await tokenWithWorktreeScope();
    const app = makeApp({
      spawn: async () => {
        throw new AgentWorktreeError(
          "git requested GPG signing. Run `giwt gpg-unlock` in the agent's own session and retry.",
          503,
          "gpg_unlock_required",
        );
      },
    },);

    const res = await post(token.raw, app,);
    expect(res.status,).toBe(503,);
    expect(await res.text(),).toContain("giwt gpg-unlock",);
  });
});

describe("idle worktree cleanup", () => {
  test("removes a 25h-old row and keeps a fresh one", async () => {
    const token = await tokenWithWorktreeScope();
    const staleId = await registerWorktree(token.id,);
    const freshId = await registerWorktree(token.id,);
    const nowMs = Date.now();
    await db.updateTable("rsi_agent_worktrees",).set({
      last_active_at: new Date(nowMs - 25 * 60 * 60 * 1000,).toISOString(),
    },).where("id", "=", staleId,).execute();

    await db.updateTable("rsi_agent_worktrees",).set({
      last_active_at: new Date(nowMs - 60_000,).toISOString(),
    },).where("id", "=", freshId,).execute();

    const removed: string[] = [];
    const count = await cleanupIdleWorktrees({
      database: db,
      nowMs: () => nowMs,
      removeWorktree: async ({ path, },) => {
        removed.push(path,);
      },
    },);

    expect(count,).toBe(1,);
    expect(removed.length,).toBe(1,);
    const stale = await db.selectFrom("rsi_agent_worktrees",).select(["removed_at",],).where("id", "=", staleId,)
      .executeTakeFirst();

    expect(stale?.removed_at,).not.toBeNull();
    const fresh = await db.selectFrom("rsi_agent_worktrees",).select(["removed_at",],).where("id", "=", freshId,)
      .executeTakeFirst();

    expect(fresh?.removed_at,).toBeNull();
  });
});

describe("real TTY-free git worktree", () => {
  test("gitWorktreeAdd creates a linked worktree with stdin closed", async () => {
    const repo = await mkdtemp(join(tmpdir(), "rsi-worktree-src-",),);
    const target = await mkdtemp(join(tmpdir(), "rsi-worktree-parent-",),);
    const path = join(target, "agent-e2e",);
    try {
      const git = (args: string[],) =>
        Bun.spawn({
          cmd: ["git", "-C", repo, ...args,],
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        },);

      for (
        const args of [
          ["init", "-q",],
          ["config", "user.email", "agent@example.invalid",],
          ["config", "user.name", "Agent",],
        ]
      ) {
        const p = git(args,);
        await p.exited;
        expect(p.exitCode,).toBe(0,);
      }

      await writeFile(join(repo, "tracked.txt",), "hello",);
      const add = git(["add", "tracked.txt",],);
      await add.exited;
      const commit = git(["-c", "commit.gpgsign=false", "commit", "-q", "-m", "init",],);
      await commit.exited;
      expect(commit.exitCode,).toBe(0,);

      await gitWorktreeAdd({ cwd: repo, branch: "agent/e2e", base: undefined, path, },);
      expect((await stat(join(path, "tracked.txt",),)).isFile(),).toBe(true,);
      await gitWorktreeRemove({ cwd: repo, path, },);
      let gone = false;
      try {
        await stat(path,);
      } catch {
        gone = true;
      }

      expect(gone,).toBe(true,);
    } finally {
      await rm(repo, { recursive: true, force: true, },);
      await rm(target, { recursive: true, force: true, },);
    }
  }, 30_000,);
});
