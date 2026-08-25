/**
 * Tests for BUG-nsfw-gate-log-plaintext-pii.
 *
 * Verifies the privacy posture of `logNsfwEvent`:
 *   - Free-form `reason` strings are rejected with a typed error.
 *   - `user_id`, `actor_id`, `chat_id` are written as HMAC hashes only —
 *     raw values never reach `log_entries`.
 *   - Known PII metadata keys (`promptFragment`, `userMessage`, `*Content`,
 *     `*Message`, `*Text`, etc.) are stripped from `meta`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { hashId, } from "../../nsfw/pii-redaction";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { logNsfwEvent, } from "./logging";

let db: Kysely<DB>;
let sqlite: Awaited<ReturnType<typeof createTestDb>>["sqlite"];

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

beforeEach(() => {
  resetTestDb(sqlite,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("logNsfwEvent", () => {
  test("rejects free-form reason (BUG-nsfw-gate-log-plaintext-pii)", async () => {
    // Free-form text MUST be rejected at runtime; cast through `unknown` to
    // bypass the compile-time enum and exercise the runtime type guard.
    await expect(logNsfwEvent(db, {
      userId: "user-1",
      action: "blocked",
      reason: "looks suspicious — possible grooming attempt" as unknown as never,
      metadata: {},
    },),).rejects.toThrow(/reason must be a NsfwGateReason/,);
  });

  test("writes hashed identifiers, never plaintext", async () => {
    const userId = "user-plain-1";
    const actorId = "actor-plain-1";

    await logNsfwEvent(db, {
      userId,
      actorId,
      chatId: "chat-plain-1",
      action: "blocked",
      reason: "blocked_by_user_pref",
      metadata: {},
    },);

    const rows = await db.selectFrom("log_entries",).selectAll().execute();
    expect(rows.length,).toBe(1,);
    const row = rows[0]!;

    // Plain IDs MUST NOT appear anywhere in the row.
    const asText = JSON.stringify(row,);
    expect(asText.includes(userId,),).toBe(false,);
    expect(asText.includes("actor-plain-1",),).toBe(false,);
    expect(asText.includes("chat-plain-1",),).toBe(false,);

    // Hashed form MUST be present.
    const expectedUserHash = await hashId(userId,);
    const expectedActorHash = await hashId(actorId,);
    expect(row.user_id,).toBe(expectedUserHash,);
    expect(row.entity_id,).toBe(expectedActorHash,);
  });

  test("strips known-PII metadata keys before writing meta", async () => {
    await logNsfwEvent(db, {
      userId: "user-meta-1",
      action: "warning",
      reason: "rating_exceeded",
      metadata: {
        promptFragment: "should never reach the log",
        userMessage: "free-form PII",
        chatContent: "another PII field",
        errorStack: "Error: …",
        messageBody: "yet more PII",
        rawText: "tail-end PII",
        userContent: "more PII",
        allowedRating: "sfw", // non-PII metadata should survive.
        severity: 2,
      },
    },);

    const row = await db.selectFrom("log_entries",).selectAll().executeTakeFirst();
    expect(row,).toBeDefined();
    const meta = JSON.parse(row?.meta ?? "{}",);
    expect(meta.promptFragment,).toBeUndefined();
    expect(meta.userMessage,).toBeUndefined();
    expect(meta.chatContent,).toBeUndefined();
    expect(meta.errorStack,).toBeUndefined();
    expect(meta.messageBody,).toBeUndefined();
    expect(meta.rawText,).toBeUndefined();
    expect(meta.userContent,).toBeUndefined();
    // Non-PII keys survive.
    expect(meta.allowedRating,).toBe("sfw",);
    expect(meta.severity,).toBe(2,);
  });

  test("null userId hashes nothing and stores null", async () => {
    await logNsfwEvent(db, {
      userId: null,
      action: "allowed",
      reason: "blocked_by_user_pref",
      metadata: {},
    },);
    const row = await db.selectFrom("log_entries",).selectAll().executeTakeFirst();
    expect(row?.user_id,).toBeNull();
    expect(row?.entity_id,).toBeNull();
  });
});
