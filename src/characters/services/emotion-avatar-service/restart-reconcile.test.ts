// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TASK-emotion-avatar-job-restart-reconciliation: restart simulation.
 *
 * Mirrors `src/crypto/key-rotation/rotation-restart.test.ts`: the job rows
 * are written against a FILE-backed SQLite database, the handle is closed
 * (simulating a process death mid-generation), a fresh Kysely instance is
 * opened on the same file — including a fresh `runMigrations` pass, exactly
 * what boot does — and `reconcileInterruptedJobs` runs as the startup sweep.
 * Pins: orphaned `running` rows become terminal `failed` with the explicit
 * `restart_interrupted` reason, committed per-slot results survive, sibling
 * avatar bindings stay intact, the in-memory cache is rebuilt from the
 * durable rows, and an SSE consumer of a reconciled job reaches a terminal
 * state instead of hanging.
 */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { mkdirSync, mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { createSqliteDialect, } from "../../../db/index";
import { runMigrations, } from "../../../db/migrate";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { handleJobStream, } from "../../../routes/character-emotion-avatars-stream";
import { createGenerationJobRecord, EMOTION_AVATAR_JOB_KIND, getGenerationJobRecord, } from "./job-records";
import { getJob, listJobs, } from "./job-store";
import { reconcileInterruptedJobs, RESTART_INTERRUPTED_REASON, } from "./restart-reconcile";
import type { BatchJobId, } from "./types";

createLogger({ level: "error", },);

const ACTOR = "actor-restart-reconcile";
const RUNNING_JOB = "job-restart-reconcile-running";
const DONE_JOB = "job-restart-reconcile-done";
const FOREIGN_JOB = "job-restart-reconcile-foreign";
const CLAIMED_JOB = "job-restart-reconcile-claimed";

let restartDir: string;
let dbPath: string;
let db: Kysely<DB> | null = null;

/** Open (or reopen) the file-backed DB with migrations applied — boot path. */
async function openDb(): Promise<Kysely<DB>> {
  const sqlite = new Database(dbPath,);
  const handle = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
  await runMigrations(handle,);
  return handle;
}

/** Close the current handle the way a process exit would. */
async function closeDb(): Promise<void> {
  if (!db) { return; }
  await db.destroy();
  db = null;
}

/** Seed the actor plus the avatar variant a crashed re-roll left bound. */
async function seedFixtures(database: Kysely<DB>,): Promise<void> {
  const now = new Date().toISOString();
  await database
    .insertInto("users",)
    .values({
      id: "test-user",
      username: "test-user",
      display_name: "Test User",
      role: "user",
      status: "active",
      settings: "{}",
      row_version: 0,
    },)
    .execute();

  await database
    .insertInto("actors",)
    .values({
      id: ACTOR,
      actor_type: "character",
      display_name: ACTOR,
      user_id: null,
      owner_id: null,
      agent_type: "ai",
      settings: "{}",
      row_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();

  await database
    .insertInto("assets",)
    .values(["old-happy", "old-sad",].map((name,) => ({
      id: `asset-${name}`,
      owner_id: "test-user",
      filename: `${name}.png`,
      mime_type: "image/png",
      asset_type: "image",
      size_bytes: 1024,
      storage_path: `/test/${name}.png`,
      storage_backend: "local",
      visibility: "private",
    })),)
    .execute();

  // The variants bound before the crash: the re-roll's happy slot and a
  // sibling sad slot. Both must survive reconciliation untouched.
  await database
    .insertInto("character_avatars",)
    .values([
      {
        id: "avatar-old-happy",
        actor_id: ACTOR,
        asset_id: "asset-old-happy",
        label: "old happy",
        tags: JSON.stringify({ emotion: "happy", },),
        is_primary: 0,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: "avatar-old-sad",
        actor_id: ACTOR,
        asset_id: "asset-old-sad",
        label: "old sad",
        tags: JSON.stringify({ emotion: "sad", },),
        is_primary: 0,
        sort_order: 1,
        created_at: now,
        updated_at: now,
      },
    ],)
    .execute();
}

beforeAll(async () => {
  restartDir = mkdtempSync(join(tmpdir(), "ll-emotion-restart-",),);
  mkdirSync(join(restartDir, "data",), { recursive: true, },);
  dbPath = join(restartDir, "data", "loop-lore.db",);
},);

afterAll(async () => {
  await closeDb();
  rmSync(restartDir, { recursive: true, force: true, },);
},);

describe("emotion-avatar job restart reconciliation", () => {
  test("marks orphaned running jobs failed, preserves results, rebuilds the cache", async () => {
    // ── Session 1: boot, seed, then die mid-generation. ──
    db = await openDb();
    await seedFixtures(db,);

    await createGenerationJobRecord(db, {
      id: RUNNING_JOB,
      kind: EMOTION_AVATAR_JOB_KIND,
      actorId: ACTOR,
      payload: { emotions: ["happy", "sad",], baseAvatarId: "avatar-old-happy", },
      startedAt: new Date().toISOString(),
    },);

    // One slot committed its result before the crash; the sweep must keep it.
    await db
      .updateTable("generation_jobs",)
      .set({
        results: JSON.stringify([
          { emotion: "happy", status: "completed", avatarId: "avatar-old-happy", assetId: "asset-old-happy", },
        ],),
      },)
      .where("id", "=", RUNNING_JOB,)
      .execute();

    // A terminal row from before the restart must not be re-touched…
    await createGenerationJobRecord(db, {
      id: DONE_JOB,
      kind: EMOTION_AVATAR_JOB_KIND,
      actorId: ACTOR,
      payload: { emotions: ["sad",], baseAvatarId: "avatar-old-sad", },
      startedAt: new Date().toISOString(),
    },);

    await db
      .updateTable("generation_jobs",)
      .set({ status: "completed", completed_at: new Date().toISOString(), },)
      .where("id", "=", DONE_JOB,)
      .execute();

    // …and a foreign job kind owns its own lifecycle — out of sweep scope.
    await db
      .insertInto("generation_jobs",)
      .values({ id: FOREIGN_JOB, kind: "other-kind", actor_id: null, status: "running", },)
      .execute();

    // ── Restart: drop the handle entirely. Nothing in-process survives. ──
    await closeDb();

    // ── Session 2: fresh handle + migrations + the startup sweep. ──
    db = await openDb();
    const summary = await reconcileInterruptedJobs(db,);
    expect(summary.interrupted,).toBe(1,);
    expect(summary.cached,).toBe(2,);

    const interrupted = await getGenerationJobRecord(db, RUNNING_JOB,);
    expect(interrupted?.status,).toBe("failed",);
    expect(interrupted?.errorMessage,).toBe(RESTART_INTERRUPTED_REASON,);
    expect(interrupted?.completedAt,).toBeDefined();
    // Committed per-slot result preserved, not clobbered by the sweep.
    expect(interrupted?.results,).toEqual([
      { emotion: "happy", status: "completed", avatarId: "avatar-old-happy", assetId: "asset-old-happy", },
    ],);

    const done = await getGenerationJobRecord(db, DONE_JOB,);
    expect(done?.status,).toBe("completed",);
    expect(done?.errorMessage,).toBeNull();

    const foreign = await getGenerationJobRecord(db, FOREIGN_JOB,);
    expect(foreign?.status,).toBe("running",);

    // In-memory cache rebuilt from the durable rows: no zombie running job.
    const cached = getJob(RUNNING_JOB as BatchJobId,);
    expect(cached?.status,).toBe("failed",);
    expect(cached?.error,).toBe(RESTART_INTERRUPTED_REASON,);
    const listed = listJobs(ACTOR,);
    expect(listed.map((job,) => job.status),).toEqual(["completed", "failed",],);

    // Interrupted re-roll keeps the previous variant bound: the crash never
    // unbound the old happy slot or its sibling.
    const avatars = await db
      .selectFrom("character_avatars",)
      .select(["id", "asset_id",],)
      .where("actor_id", "=", ACTOR,)
      .execute();

    expect(avatars.map((row,) => row.asset_id),).toEqual(["asset-old-happy", "asset-old-sad",],);
  }, 30_000,);

  test("second pass is a no-op — no zombie rows either way", async () => {
    // Self-contained (own file-backed DB + ids): passes alone and in any
    // order. Asserts the sweep-then-sweep idempotency directly instead of
    // reusing the sibling test's rows.
    const dir = mkdtempSync(join(tmpdir(), "ll-emotion-restart-idem-",),);
    mkdirSync(join(dir, "data",), { recursive: true, },);
    const sqlite = new Database(join(dir, "data", "loop-lore.db",),);
    const idemDb = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
    try {
      await runMigrations(idemDb,);
      await idemDb
        .insertInto("actors",)
        .values({
          id: "actor-restart-reconcile-idem",
          actor_type: "character",
          display_name: "actor-restart-reconcile-idem",
          user_id: null,
          owner_id: null,
          agent_type: "ai",
          settings: "{}",
          row_version: 0,
          visibility: "private",
          import_spec: "{}",
        },)
        .execute();

      await createGenerationJobRecord(idemDb, {
        id: "job-restart-reconcile-idem",
        kind: EMOTION_AVATAR_JOB_KIND,
        actorId: "actor-restart-reconcile-idem",
        payload: { emotions: ["happy",], baseAvatarId: "avatar-old-happy", },
        startedAt: new Date().toISOString(),
      },);

      const first = await reconcileInterruptedJobs(idemDb,);
      expect(first.interrupted,).toBe(1,);
      const second = await reconcileInterruptedJobs(idemDb,);
      expect(second.interrupted,).toBe(0,);
      expect(second.cached,).toBe(1,);

      const rows = await idemDb
        .selectFrom("generation_jobs",)
        .select(["id", "status",],)
        .where("kind", "=", EMOTION_AVATAR_JOB_KIND,)
        .execute();

      expect(rows.every((row,) => row.status !== "running"),).toBe(true,);
    } finally {
      await idemDb.destroy();
      rmSync(dir, { recursive: true, force: true, },);
    }
  });

  test("already-claimed running row is not double-swept", async () => {
    // Self-contained: own file-backed DB plus a distinct actor/job id, so
    // this passes alone and in any order. Sharing the sibling tests' DB
    // would couple `summary.cached` to their rows, and sharing their actor
    // id would leak this row into their `listJobs(ACTOR)` assertion through
    // the module-global job cache.
    const CLAIM_ACTOR = "actor-restart-reconcile-claimed";
    const dir = mkdtempSync(join(tmpdir(), "ll-emotion-restart-claim-",),);
    mkdirSync(join(dir, "data",), { recursive: true, },);
    const sqlite = new Database(join(dir, "data", "loop-lore.db",),);
    const claimedDb = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
    try {
      await runMigrations(claimedDb,);
      await claimedDb
        .insertInto("actors",)
        .values({
          id: CLAIM_ACTOR,
          actor_type: "character",
          display_name: CLAIM_ACTOR,
          user_id: null,
          owner_id: null,
          agent_type: "ai",
          settings: "{}",
          row_version: 0,
          visibility: "private",
          import_spec: "{}",
        },)
        .execute();

      await createGenerationJobRecord(claimedDb, {
        id: CLAIMED_JOB,
        kind: EMOTION_AVATAR_JOB_KIND,
        actorId: CLAIM_ACTOR,
        payload: { emotions: ["happy",], baseAvatarId: "avatar-old-happy", },
        startedAt: new Date().toISOString(),
      },);

      const before = new Date().toISOString();
      await claimedDb
        .updateTable("generation_jobs",)
        .set({ error_message: RESTART_INTERRUPTED_REASON, completed_at: before, },)
        .where("id", "=", CLAIMED_JOB,)
        .execute();

      const summary = await reconcileInterruptedJobs(claimedDb,);
      expect(summary.interrupted,).toBe(0,);
      expect(summary.cached,).toBe(1,);

      const claimed = await getGenerationJobRecord(claimedDb, CLAIMED_JOB,);
      expect(claimed?.status,).toBe("running",);
      expect(claimed?.errorMessage,).toBe(RESTART_INTERRUPTED_REASON,);
      expect(claimed?.completedAt,).toBe(before,);
    } finally {
      await claimedDb.destroy();
      rmSync(dir, { recursive: true, force: true, },);
    }
  });

  test("SSE consumer of a reconciled job reaches a terminal state, not a hang", async () => {
    // Self-contained: reconciles its own DB row so this passes alone and
    // in any order, instead of reading the sibling test's cached job.
    const SSE_ACTOR = "actor-restart-reconcile-sse";
    const SSE_JOB = "job-restart-reconcile-sse";
    const dir = mkdtempSync(join(tmpdir(), "ll-emotion-restart-sse-",),);
    mkdirSync(join(dir, "data",), { recursive: true, },);
    const sqlite = new Database(join(dir, "data", "loop-lore.db",),);
    const sseDb = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
    try {
      await runMigrations(sseDb,);
      await sseDb
        .insertInto("actors",)
        .values({
          id: SSE_ACTOR,
          actor_type: "character",
          display_name: SSE_ACTOR,
          user_id: null,
          owner_id: null,
          agent_type: "ai",
          settings: "{}",
          row_version: 0,
          visibility: "private",
          import_spec: "{}",
        },)
        .execute();

      await createGenerationJobRecord(sseDb, {
        id: SSE_JOB,
        kind: EMOTION_AVATAR_JOB_KIND,
        actorId: SSE_ACTOR,
        payload: { emotions: ["happy",], baseAvatarId: "avatar-old-happy", },
        startedAt: new Date().toISOString(),
      },);

      await reconcileInterruptedJobs(sseDb,);
    } finally {
      await sseDb.destroy();
      rmSync(dir, { recursive: true, force: true, },);
    }

    const job = getJob(SSE_JOB as BatchJobId,);
    expect(job,).toBeDefined();

    const response = handleJobStream(job!,);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    let text = "";
    // A terminal snapshot must close the stream: the loop ends on `done`,
    // it never waits for progress events that no process will ever emit.
    for (;;) {
      const { done, value, } = await reader.read();
      if (done) { break; }
      text += new TextDecoder().decode(value,);
    }

    expect(text,).toContain("event: progress",);
    expect(text,).toContain('"status":"failed"',);
    expect(text,).toContain("event: done",);
  });
});
