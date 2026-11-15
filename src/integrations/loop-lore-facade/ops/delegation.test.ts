// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/delegation.test.ts — `delegate_task`
// over the real queue-store on a :memory: database.
//
// Slice-1 acceptance, each through runFacadeOp:
//  - spawn validates (400 on a bad body / unknown action) and clamps budgets
//  - depth-2 spawn is rejected (a child may not delegate further)
//  - list shows the caller's child; cancel stops it
//  - a running turn cannot be cancelled (409, no interrupt seam)
//  - principal A's child is invisible to principal B (404/empty, never 403)
//
// Resource contract (parallel-safe): one :memory: SQLite per file via
// createTestDb, no ports, no env, no sleeps.

import { Value, } from "@sinclair/typebox/value";
import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { principalKind, } from "../../../middleware/principal-kind";
import { createRequestContext, } from "../../../middleware/types";
import { createTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../../test-utils/insert-helpers";
import { createFacadeRegistry, runFacadeOp, } from "../registry";
import { facadeContextFromRequestContext, } from "../types";
import { DEFAULT_DELEGATION_CAPS, DelegateTaskBody, type DelegationCaps, registerDelegateTaskOps, } from "./delegation";

const ALICE = "deleg-alice";
const BOB = "deleg-bob";
const CHAT = "deleg-chat-1";
const ACTOR_A = "deleg-actor-a";
const ACTOR_B = "deleg-actor-b";

let testDb: TestDb;
let db: Kysely<DB>;
let config: Config;

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  config = {} as Config;

  await insertUsers(db, ALICE, "Deleg Alice", { id: ALICE, },);
  await insertUsers(db, BOB, "Deleg Bob", { id: BOB, },);
  await insertChats(db, "deleg-chat", ALICE, { id: CHAT, },);
  await insertActors(db, "Alice Actor", { id: ACTOR_A, owner_id: ALICE, },);
  await insertActors(db, "Bob Actor", { id: ACTOR_B, owner_id: BOB, },);
},);

function buildRegistry(caps: DelegationCaps = DEFAULT_DELEGATION_CAPS,): ReturnType<typeof createFacadeRegistry> {
  const registry = createFacadeRegistry();
  registerDelegateTaskOps(registry, { database: db, config, }, caps,);
  return registry;
}

function ctxFor(userId: string,): ReturnType<typeof facadeContextFromRequestContext> {
  const rc = createRequestContext({
    userId,
    userRole: "user",
    sessionId: null,
    principalKind: principalKind("user",),
  },);

  return facadeContextFromRequestContext({ ...rc, requestId: "req-deleg-1", }, db, config,);
}

function spawnBody(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    action: "spawn",
    profile: "test-profile",
    prompt: "do the thing",
    chatId: CHAT,
    actorId: ACTOR_A,
    ...overrides,
  };
}

async function spawnAs(
  userId: string,
  overrides: Record<string, unknown> = {},
  caps?: DelegationCaps,
): Promise<{ status: number; json: any }> {
  const result = await runFacadeOp(buildRegistry(caps,), ctxFor(userId,), "delegate_task", spawnBody(overrides,),);
  return { status: result.status, json: result.json as any, };
}

describe("delegate_task spawn", () => {
  test("the published body schema is one object (MCP tools/list requires type: object)", async () => {
    expect(Value.Check(DelegateTaskBody, spawnBody(),),).toBe(true,);
    expect(Value.Check(DelegateTaskBody, { action: "steer", },),).toBe(false,);
  });

  test("rejects a body missing the prompt with 400", async () => {
    const { prompt: _drop, ...noPrompt } = spawnBody();
    const result = await runFacadeOp(buildRegistry(), ctxFor(ALICE,), "delegate_task", noPrompt,);
    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(400,);
  });

  test("rejects an unknown action with 400", async () => {
    const result = await runFacadeOp(buildRegistry(), ctxFor(ALICE,), "delegate_task", { action: "steer", },);
    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(400,);
  });

  test("clamps budgets to the ceiling instead of rejecting", async () => {
    const caps: DelegationCaps = { ...DEFAULT_DELEGATION_CAPS, maxStepsCeiling: 100, maxTimeoutMsCeiling: 60_000, };
    const { status, json, } = await spawnAs(ALICE, { maxSteps: 10_000, timeoutMs: 9_999_999, }, caps,);
    expect(status,).toBe(201,);
    expect(json.maxSteps,).toBe(100,);
    expect(json.timeoutMs,).toBe(60_000,);
    expect(json.budgetClamped,).toBe(true,);
    expect(json.depth,).toBe(1,);
  });

  test("answers 403 while the master switch is off", async () => {
    const { status, json, } = await spawnAs(
      ALICE,
      {},
      { ...DEFAULT_DELEGATION_CAPS, enabled: false, },
    );

    expect(status,).toBe(403,);
    expect((json as any).error,).toBe("delegation_disabled",);
  });

  test("rejects a depth-2 spawn from a delegated child", async () => {
    const parent = await spawnAs(ALICE,);
    expect(parent.status,).toBe(201,);
    const child = await runFacadeOp(
      buildRegistry(),
      ctxFor(ALICE,),
      "delegate_task",
      spawnBody({
        parentDelegationId: (parent.json as any).delegationId,
      },),
    );

    expect(child.ok,).toBe(false,);
    expect(child.status,).toBe(400,);
    expect((child.json as any).error,).toBe("depth_exceeded",);
  });

  test("answers 429 past the active-children cap", async () => {
    const caps: DelegationCaps = { ...DEFAULT_DELEGATION_CAPS, maxActiveChildren: 1, };
    const first = await spawnAs(BOB, { actorId: ACTOR_B, }, caps,);
    expect(first.status,).toBe(201,);
    const second = await spawnAs(BOB, { actorId: ACTOR_B, }, caps,);
    expect(second.status,).toBe(429,);
  });
});

describe("delegate_task list/cancel", () => {
  test("list shows the caller's outstanding child", async () => {
    const spawned = await spawnAs(ALICE, { prompt: "list me", },);
    expect(spawned.status,).toBe(201,);
    const listed = await runFacadeOp(buildRegistry(), ctxFor(ALICE,), "delegate_task", { action: "list", },);
    expect(listed.ok,).toBe(true,);
    const rows = (listed.json as any).delegations as Array<{ delegationId: string }>;
    expect(rows.map((row,) => row.delegationId),).toContain((spawned.json as any).delegationId,);
  });

  test("cancel stops a queued child and it leaves the list", async () => {
    const spawned = await spawnAs(ALICE, { prompt: "cancel me", },);
    const id = (spawned.json as any).delegationId as string;
    const cancelled = await runFacadeOp(buildRegistry(), ctxFor(ALICE,), "delegate_task", {
      action: "cancel",
      delegationId: id,
    },);

    expect(cancelled.ok,).toBe(true,);
    expect((cancelled.json as any).status,).toBe("cancelled",);
    const listed = await runFacadeOp(buildRegistry(), ctxFor(ALICE,), "delegate_task", { action: "list", },);
    const rows = (listed.json as any).delegations as Array<{ delegationId: string }>;
    expect(rows.map((row,) => row.delegationId),).not.toContain(id,);
  });

  test("cancel answers 409 for a running turn (no interrupt seam)", async () => {
    const spawned = await spawnAs(ALICE, { prompt: "already running", },);
    const id = (spawned.json as any).delegationId as string;
    await db.updateTable("harness_queue_turns",).set({ status: "running", },).where("id", "=", id,).execute();
    const cancelled = await runFacadeOp(buildRegistry(), ctxFor(ALICE,), "delegate_task", {
      action: "cancel",
      delegationId: id,
    },);

    expect(cancelled.ok,).toBe(false,);
    expect(cancelled.status,).toBe(409,);
    expect((cancelled.json as any).error,).toBe("running_no_interrupt_seam",);
  });

  test("principal B sees nothing of principal A's child", async () => {
    const spawned = await spawnAs(ALICE, { prompt: "alice only", actorId: ACTOR_A, },);
    const id = (spawned.json as any).delegationId as string;
    const listed = await runFacadeOp(buildRegistry(), ctxFor(BOB,), "delegate_task", { action: "list", },);
    const rows = (listed.json as any).delegations as Array<{ delegationId: string }>;
    expect(rows.map((row,) => row.delegationId),).not.toContain(id,);
    // 404, never 403 — existence must not leak across principals.
    const cancelled = await runFacadeOp(buildRegistry(), ctxFor(BOB,), "delegate_task", {
      action: "cancel",
      delegationId: id,
    },);

    expect(cancelled.ok,).toBe(false,);
    expect(cancelled.status,).toBe(404,);
  });
});
