// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation-routes/status.ts — GET /api/generation/status/:chatId.
 *
 * Covers the active-generation reporting path (isActive true/false across
 * generation statuses, full attempt metadata in the payload) and the
 * authorization ordering (participants and admins may poll; outsiders are
 * refused before any state is revealed). Uses a real in-memory DB and the
 * real cancellation-tracker maps.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { GenerationStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import type { TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import {
  type ActiveGeneration,
  activeGenerations,
  chatToAttempt,
} from "../cancellation-tracker";
import { handleGenerationStatus, } from "./status";

createLogger({ level: "error", },);

// ── Fixtures ──────────────────────────────────────────────
// Parallel-safety: each test gets its own in-memory DB via createTestDb()
// and unique IDs — no shared mutable state.

let ownerId = "";
let memberId = "";
let outsiderId = "";
let chatId = "";
let testDb: Kysely<DB> | null = null;
let sqlite: TestDb["sqlite"] | null = null;

/** Fresh DB with one chat (owner) + one member participant + one outsider. */
async function makeFixtures(): Promise<void> {
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
}

afterEach(() => {
  if (sqlite) { sqlite.close(); }
  sqlite = null;
  testDb = null;
},);

// ── In-memory tracking seeds ──────────────────────────────

beforeEach(() => {
  activeGenerations.clear();
  chatToAttempt.clear();
},);

/**
 * Register an active generation for the fixture chat directly in the
 * tracker maps (the same state startGenerationTracking produces).
 * @param overrides
 */
function seedActive(overrides: {
  status?: GenerationStatus;
  actorId?: string;
  chunksReceived?: number;
  charsReceived?: number;
} = {},): string {
  const attemptId = `att-${crypto.randomUUID()}`;
  activeGenerations.set(attemptId, {
    attemptId,
    chatId,
    actorId: overrides.actorId ?? "actor-1",
    status: overrides.status ?? GenerationStatus.Streaming,
    startedAt: Date.now(),
    chunksReceived: overrides.chunksReceived ?? 3,
    charsReceived: overrides.charsReceived ?? 42,
  } as ActiveGeneration,);
  chatToAttempt.set(chatId, attemptId,);
  return attemptId;
}

// ── Tests ──────────────────────────────────────────────────

describe("handleGenerationStatus", () => {
  test("reports an active generation with full attempt metadata", async () => {
    await makeFixtures();
    const attemptId = seedActive();
    const res = await handleGenerationStatus(chatId, testDb!, ownerId,);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as {
      isActive: boolean;
      attemptId: string | null;
      generation: {
        attemptId: string;
        chatId: string;
        actorId: string;
        status: GenerationStatus;
        elapsedMs: number;
        chunksReceived: number;
        charsReceived: number;
      } | null;
    };
    expect(data.isActive,).toBe(true,);
    expect(data.attemptId,).toBe(attemptId,);
    expect(data.generation,).not.toBeNull();
    expect(data.generation!.attemptId,).toBe(attemptId,);
    expect(data.generation!.chatId,).toBe(chatId,);
    expect(data.generation!.actorId,).toBe("actor-1",);
    expect(data.generation!.status,).toBe(GenerationStatus.Streaming,);
    expect(data.generation!.elapsedMs,).toBeGreaterThanOrEqual(0,);
    expect(data.generation!.chunksReceived,).toBe(3,);
    expect(data.generation!.charsReceived,).toBe(42,);
  });

  test("reports isActive=false for a cancelled generation but still returns its attemptId", async () => {
    await makeFixtures();
    const attemptId = seedActive({ status: GenerationStatus.Cancelled, },);
    const res = await handleGenerationStatus(chatId, testDb!, ownerId,);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as {
      isActive: boolean;
      attemptId: string | null;
      generation: { status: GenerationStatus } | null;
    };
    expect(data.isActive,).toBe(false,);
    expect(data.attemptId,).toBe(attemptId,);
    expect(data.generation?.status,).toBe(GenerationStatus.Cancelled,);
  });

  test("reports isActive=false for a completed generation", async () => {
    await makeFixtures();
    seedActive({ status: GenerationStatus.Completed, },);
    const res = await handleGenerationStatus(chatId, testDb!, ownerId,);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { isActive: boolean };
    expect(data.isActive,).toBe(false,);
  });

  test("lets an admin poll status for a chat they do not participate in", async () => {
    await makeFixtures();
    seedActive();
    const res = await handleGenerationStatus(chatId, testDb!, outsiderId, "admin",);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { isActive: boolean };
    expect(data.isActive,).toBe(true,);
  });

  test("forbids a non-participant from polling status even during an active generation", async () => {
    await makeFixtures();
    seedActive();
    const res = await handleGenerationStatus(chatId, testDb!, outsiderId,);
    expect(res.status,).toBe(403,);
  });

  test("returns 400 when chatId is empty", async () => {
    await makeFixtures();
    const res = await handleGenerationStatus("", testDb!, ownerId,);
    expect(res.status,).toBe(400,);
  });

  test("returns 401 when unauthenticated", async () => {
    await makeFixtures();
    const res = await handleGenerationStatus(chatId, testDb!,);
    expect(res.status,).toBe(401,);
  });
});
