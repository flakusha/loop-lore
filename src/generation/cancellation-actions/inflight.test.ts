// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/cancellation-actions/inflight.ts — in-flight
 * generation idempotency lookup.
 *
 * Uses in-memory SQLite via createTestDb() (mirrors continuation.test.ts):
 * covers the happy path per in-flight status, terminal statuses, key
 * mismatches, and damaged rows (invalid status value, empty-string key —
 * the schema itself rejects NULL idempotency_key).
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { GenerationStatus, } from "../../db/enums";
import { createTestDb, } from "../../test-utils/create-test-db";
import { hasInFlightGeneration, } from "./inflight";

let db: Kysely<DB>;

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
},);

/** Seed the FK parent rows once (users → chats → actors → messages). */
async function seedParents(): Promise<void> {
  await db.insertInto("users",).values({
    id: "user-1",
    username: "test",
    display_name: "Test",
    role: "user",
    status: "active",
    settings: "{}",
  },).execute();
  await db.insertInto("chats",).values({
    id: "chat-1",
    name: "Test Chat",
    type: "direct",
    mode: "direct",
    created_by: "user-1",
  },).execute();
  await db.insertInto("actors",).values({
    id: "actor-1",
    actor_type: "character",
    display_name: "AI",
    agent_type: "ai",
    settings: "{}",
    format_version: 0,
    import_spec: "{}",
  },).execute();
  await db.insertInto("messages",).values({
    id: "msg-1",
    chat_id: "chat-1",
    actor_id: "actor-1",
    role: "assistant",
    content: "",
    content_type: "text",
    content_format: "markdown",
    content_encoding: "identity",
    status: "confirmed",
    visibility: "visible",
  },).execute();
}

/** Insert one generation_attempts row with the given key and status. */
async function seedAttempt(id: string, idempotencyKey: string, status: GenerationStatus,): Promise<void> {
  await db
    .insertInto("generation_attempts",)
    .values({
      id,
      chat_id: "chat-1",
      parent_message_id: "msg-1",
      actor_id: "actor-1",
      idempotency_key: idempotencyKey,
      model_id: "test-model",
      provider: "test",
      status,
      step_index: 0,
      total_steps: 1,
    },)
    .execute();
}

describe("hasInFlightGeneration", () => {
  it("returns false when no attempts exist", async () => {
    await seedParents();
    expect(await hasInFlightGeneration(db, "key-empty",),).toBe(false,);
  });

  for (const status of [
    GenerationStatus.Pending,
    GenerationStatus.Processing,
    GenerationStatus.Streaming,
  ] as const) {
    it(`returns true for an in-flight attempt in status ${status}`, async () => {
      await seedAttempt(`att-inflight-${status}`, `key-${status}`, status,);
      expect(await hasInFlightGeneration(db, `key-${status}`,),).toBe(true,);
    });
  }

  for (const status of [
    GenerationStatus.Completed,
    GenerationStatus.Cancelled,
    GenerationStatus.Failed,
  ] as const) {
    it(`returns false for a settled attempt in status ${status}`, async () => {
      await seedAttempt(`att-settled-${status}`, `key-${status}`, status,);
      expect(await hasInFlightGeneration(db, `key-${status}`,),).toBe(false,);
    });
  }

  it("returns false when only a different key is in flight", async () => {
    await seedAttempt("att-other-key", "key-other", GenerationStatus.Processing,);
    expect(await hasInFlightGeneration(db, "key-unrelated",),).toBe(false,);
    expect(await hasInFlightGeneration(db, "key-other",),).toBe(true,);
  });

  it("treats an unknown status value as not in flight (damaged row)", async () => {
    await seedAttempt("att-bogus-status", "key-bogus", "not-a-real-status" as unknown as GenerationStatus,);
    expect(await hasInFlightGeneration(db, "key-bogus",),).toBe(false,);
  });

  it("matches an empty-string key as a real key (damaged row)", async () => {
    await seedAttempt("att-empty-key", "", GenerationStatus.Processing,);
    expect(await hasInFlightGeneration(db, "",),).toBe(true,);
  });
});
