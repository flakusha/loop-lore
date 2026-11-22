// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { handleRetryGeneration, } from "./retry";

interface Fixture {
  db: Kysely<DB>;
  fixture: TestDb;
  ownerA: string;
  ownerB: string;
  chatA: string;
  chatB: string;
  attemptB: string;
  parentMessageId: string;
  actorId: string;
}

/** Own DB + unique ids per test — no shared module state, safe under --parallel. */
async function seed(): Promise<Fixture> {
  const fixture = await createTestDb();
  const db = fixture.db;
  const ownerA = `u-${randomUUID()}`;
  const ownerB = `u-${randomUUID()}`;
  const chatA = `c-${randomUUID()}`;
  const chatB = `c-${randomUUID()}`;
  const actorId = `a-${randomUUID()}`;
  const parentMessageId = `m-${randomUUID()}`;
  const attemptB = `att-${randomUUID()}`;

  for (const userId of [ownerA, ownerB,]) {
    await db.insertInto("users",).values({
      id: userId,
      username: userId,
      display_name: "Test",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
  }

  for (const [chatId, userId,] of [[chatA, ownerA,], [chatB, ownerB,],] as const) {
    await db.insertInto("chats",).values({
      id: chatId,
      name: "Test chat",
      type: "direct",
      mode: "direct",
      created_by: userId,
    },).execute();

    await db.insertInto("chat_owners",).values({ chat_id: chatId, user_id: userId, },).execute();
  }

  await db.insertInto("actors",).values({
    id: actorId,
    actor_type: "character",
    display_name: "AI",
    agent_type: "ai",
    settings: "{}",
    row_version: 0,
    import_spec: "{}",
  },).execute();

  await db.insertInto("messages",).values({
    id: parentMessageId,
    chat_id: chatB,
    actor_id: actorId,
    role: "assistant",
    content: "original",
    content_type: "text",
    content_format: "markdown",
    content_encoding: "identity",
    status: "confirmed",
    visibility: "visible",
  },).execute();

  await db.insertInto("generation_attempts",).values({
    id: attemptB,
    chat_id: chatB,
    parent_message_id: parentMessageId,
    actor_id: actorId,
    idempotency_key: `key-${randomUUID()}`,
    model_id: "test-model",
    provider: "test",
    status: "failed",
    step_index: 2,
    total_steps: 5,
  },).execute();

  return { db, fixture, ownerA, ownerB, chatA, chatB, attemptB, parentMessageId, actorId, };
}

describe("handleRetryGeneration attempt scoping", () => {
  test("404s a foreign-chat attempt without leaking step metadata", async () => {
    const s = await seed();
    try {
      const res = await handleRetryGeneration(
        { chatId: s.chatA, attemptId: s.attemptB, step: 2, },
        s.db,
        s.ownerA,
      );

      const data = await res.json() as Record<string, unknown>;
      expect(res.status,).toBe(404,);
      expect(data.error,).toBe("Generation attempt not found",);
      expect("resumeFromStep" in data,).toBe(false,);
      expect("totalSteps" in data,).toBe(false,);
      expect("parentMessageId" in data,).toBe(false,);
      expect("actorId" in data,).toBe(false,);
    } finally {
      await destroyTestDb(s.fixture,);
    }
  });

  test("resolves an own-chat attempt with the metadata needed to re-dispatch", async () => {
    const s = await seed();
    try {
      const res = await handleRetryGeneration(
        { chatId: s.chatB, attemptId: s.attemptB, step: 99, },
        s.db,
        s.ownerB,
      );

      const data = await res.json() as Record<string, unknown>;
      expect(res.status,).toBe(200,);
      expect(data.resumeFromStep,).toBe(4,);
      expect(data.totalSteps,).toBe(5,);
      expect(data.parentMessageId,).toBe(s.parentMessageId,);
      expect(data.actorId,).toBe(s.actorId,);
    } finally {
      await destroyTestDb(s.fixture,);
    }
  });
});
