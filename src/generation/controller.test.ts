/**
 * Tests for generation controller (input validation and non-DB paths).
 */
import { afterEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import type { TestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../test-utils/insert-helpers";
import {
  handleCancelGeneration,
  handleGenerationStatus,
  handleListActiveGenerations,
  handleRegenerate,
  handleRetryGeneration,
} from "./generation-routes";

// ── Fixtures ──────────────────────────────────────────────
// Parallel-safety: each test gets its own in-memory DB via createTestDb()
// and unique participant/actor IDs — no shared mutable state.

let ownerId = "";
let memberId = "";
let outsiderId = "";
let chatId = "";
let testDb: Kysely<DB> | null = null;
let sqlite: TestDb["sqlite"] | null = null;

/** Fresh DB with one chat (owner) + one member participant + one outsider. */
async function makeFixtures(): Promise<{ owner: string; member: string; outsider: string; chat: string }> {
  const { db, sqlite: raw, } = await createTestDb();
  testDb = db;
  sqlite = raw;

  ownerId = `owner-${crypto.randomUUID()}`;
  memberId = `member-${crypto.randomUUID()}`;
  outsiderId = `outsider-${crypto.randomUUID()}`;
  chatId = `chat-${crypto.randomUUID()}`;

  await insertUsers(db, `${ownerId}-user`, "Owner", { id: ownerId, } as never,);
  await insertUsers(db, `${memberId}-user`, "Member", { id: memberId, } as never,);
  await insertUsers(db, `${outsiderId}-user`, "Outsider", { id: outsiderId, } as never,);
  await insertActors(db, "Owner", { id: ownerId, actor_type: "user", user_id: ownerId, } as never,);
  await insertActors(db, "Member", { id: memberId, actor_type: "user", user_id: memberId, } as never,);
  await insertActors(db, "Outsider", { id: outsiderId, actor_type: "user", user_id: outsiderId, } as never,);
  await insertChats(db, "Test Chat", ownerId, { id: chatId, } as never,);
  await insertChatParticipants(db, chatId, ownerId, { role_in_chat: "owner", } as never,);
  await insertChatParticipants(db, chatId, memberId,);

  return { owner: ownerId, member: memberId, outsider: outsiderId, chat: chatId, };
}

afterEach(() => {
  if (sqlite) { sqlite.close(); }
  sqlite = null;
  testDb = null;
},);

/**
 * Tests for generation controller (input validation and non-DB paths).
 */

describe("handleCancelGeneration", () => {
  test("returns 401 when unauthenticated", async () => {
    const res = await handleCancelGeneration({ chatId: "x", }, testDb!,);
    expect(res.status,).toBe(401,);
  });

  test("returns 400 when both chatId and attemptId missing", async () => {
    const { owner, } = await makeFixtures();
    const res = await handleCancelGeneration({}, testDb!, owner,);
    expect(res.status,).toBe(400,);
  });

  test("returns 404 when no active generation for chatId", async () => {
    const { owner, } = await makeFixtures();
    const res = await handleCancelGeneration({ chatId, }, testDb!, owner,);
    expect(res.status,).toBe(404,);
  });

  test("returns 403 for a nonexistent chat", async () => {
    const { owner, } = await makeFixtures();
    const res = await handleCancelGeneration({ chatId: "nonexistent-chat", }, testDb!, owner,);
    expect(res.status,).toBe(403,);
  });

  test("returns 403 for a non-participant cancelling a foreign chat", async () => {
    const { outsider, } = await makeFixtures();
    const res = await handleCancelGeneration({ chatId, }, testDb!, outsider,);
    expect(res.status,).toBe(403,);
  });
});

describe("handleGenerationStatus", () => {
  test("returns 401 when unauthenticated", async () => {
    const res = await handleGenerationStatus("chat-1", testDb!,);
    expect(res.status,).toBe(401,);
  });

  test("returns 400 when chatId missing", async () => {
    const { owner, } = await makeFixtures();
    const res = await handleGenerationStatus("", testDb!, owner,);
    expect(res.status,).toBe(400,);
  });

  test("returns 403 for a non-participant", async () => {
    const { outsider, } = await makeFixtures();
    const res = await handleGenerationStatus(chatId, testDb!, outsider,);
    expect(res.status,).toBe(403,);
  });

  test("returns inactive status for non-generating chat (participant)", async () => {
    const { member, } = await makeFixtures();
    const res = await handleGenerationStatus(chatId, testDb!, member,);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { isActive: boolean; attemptId: string | null; generation: unknown };
    expect(data.isActive,).toBe(false,);
    expect(data.attemptId,).toBeNull();
    expect(data.generation,).toBeNull();
  });
});

describe("handleListActiveGenerations", () => {
  test("returns 401 when unauthenticated", () => {
    const res = handleListActiveGenerations();
    expect(res.status,).toBe(401,);
  });

  test("returns 403 for a non-admin user", () => {
    const res = handleListActiveGenerations(undefined, "user-1", "user",);
    expect(res.status,).toBe(403,);
  });

  test("returns list structure for admin", async () => {
    const res = handleListActiveGenerations(undefined, "admin-1", "admin",);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { count: number; generations: unknown[] };
    expect(typeof data.count,).toBe("number",);
    expect(Array.isArray(data.generations,),).toBe(true,);
  });
});

describe("handleRetryGeneration", () => {
  test("returns 400 when chatId missing", async () => {
    const { owner, } = await makeFixtures();
    const res = await handleRetryGeneration({}, testDb!, owner,);
    expect(res.status,).toBe(400,);
  });

  test("returns 403 for a non-participant", async () => {
    const { outsider, } = await makeFixtures();
    const res = await handleRetryGeneration({ chatId, }, testDb!, outsider,);
    expect(res.status,).toBe(403,);
  });

  test("returns retry response with defaults (participant)", async () => {
    const { member, } = await makeFixtures();
    const res = await handleRetryGeneration({ chatId, }, testDb!, member,);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as {
      ok: boolean;
      chatId: string;
      resumeFromStep: number;
      totalSteps: number;
    };
    expect(data.ok,).toBe(true,);
    expect(data.chatId,).toBe(chatId,);
    expect(data.resumeFromStep,).toBe(0,);
    expect(data.totalSteps,).toBe(1,);
  });

  test("resumes from specified step when provided without attemptId", async () => {
    const { member, } = await makeFixtures();
    const res = await handleRetryGeneration({ chatId, step: 2, }, testDb!, member,);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { resumeFromStep: number; totalSteps: number };
    expect(data.resumeFromStep,).toBe(2,);
    expect(data.totalSteps,).toBe(1,);
  });

  test("clamps negative step to 0", async () => {
    const { member, } = await makeFixtures();
    const res = await handleRetryGeneration({ chatId, step: -5, }, testDb!, member,);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { resumeFromStep: number };
    expect(data.resumeFromStep,).toBe(0,);
  });
});

describe("handleRegenerate", () => {
  test("returns 401 when unauthenticated", async () => {
    const res = await handleRegenerate({ chatId: "chat-1", }, testDb!,);
    expect(res.status,).toBe(401,);
  });

  test("returns 400 when chatId missing", async () => {
    const { owner, } = await makeFixtures();
    const res = await handleRegenerate({}, testDb!, { userId: owner, },);
    expect(res.status,).toBe(400,);
  });

  test("returns 403 for a non-participant", async () => {
    const { outsider, } = await makeFixtures();
    const res = await handleRegenerate({ chatId, }, testDb!, { userId: outsider, },);
    expect(res.status,).toBe(403,);
  });

  test("returns success with ready flag (participant)", async () => {
    const { member, } = await makeFixtures();
    const res = await handleRegenerate({ chatId, }, testDb!, { userId: member, },);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { ok: boolean; chatId: string; ready: boolean };
    expect(data.ok,).toBe(true,);
    expect(data.chatId,).toBe(chatId,);
    expect(data.ready,).toBe(true,);
  });
});
