// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the archive-expiration GC sweep (FEAT-chat-archive-gc-job).
 *
 * - archived + old → purged
 * - archived + new → skipped
 * - already deleted → no-op
 * - audit-log row written per purge (verified via the captured logger + DB)
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { PinnedState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import type { Logger, } from "../logger/types";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertSystemConfig,
  insertUsers,
} from "../test-utils/insert-helpers";
import { runArchiveExpirationGc, } from "./archive-expiration";

/** Capture-only logger used to assert structured audit lines without
 * reaching for a global mutation. */
class CaptureLogger implements Logger {
  public readonly entries: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];

  trace(message: string, meta?: Record<string, unknown>,): void {
    this.entries.push({ level: "trace", message, meta, },);
  }
  debug(message: string, meta?: Record<string, unknown>,): void {
    this.entries.push({ level: "debug", message, meta, },);
  }
  info(message: string, meta?: Record<string, unknown>,): void {
    this.entries.push({ level: "info", message, meta, },);
  }
  warn(message: string, meta?: Record<string, unknown>,): void {
    this.entries.push({ level: "warn", message, meta, },);
  }
  error(message: string, error?: Error, meta?: Record<string, unknown>,): void {
    this.entries.push({ level: "error", message, meta: { ...meta, error: error?.message, }, },);
  }
  fatal(message: string, error?: Error, meta?: Record<string, unknown>,): void {
    this.entries.push({ level: "fatal", message, meta: { ...meta, error: error?.message, }, },);
  }

  child(_bindings: Record<string, unknown>,): Logger {
    return this;
  }
  addTransport(): void {}
  setBindings(): void {}
  setLevel(): void {}
  async flush(): Promise<void> {}
}

describe("archive expiration GC (FEAT-chat-archive-gc-job)", () => {
  let db: Kysely<DB>;
  const ownerId: string = crypto.randomUUID();
  let captured: CaptureLogger;
  const NOW = new Date("2026-06-01T00:00:00.000Z",);

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", {
      id: ownerId,
      user_id: ownerId,
      owner_id: ownerId,
    } as never,);

    captured = new CaptureLogger();
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  async function seedArchivedChat(updatedAt: string,): Promise<string> {
    const chatId: string = crypto.randomUUID();
    await insertChats(db, "Archived", ownerId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: "owner", },);
    await db.updateTable("chats",).set({ is_pinned: PinnedState.Archived, updated_at: updatedAt, },).where(
      "id",
      "=",
      chatId,
    ).execute();

    return chatId;
  }

  test("archived + old chat is purged, audit line is written, log_entries row inserted", async () => {
    const oldChat = await seedArchivedChat("2025-01-01T00:00:00.000Z",);
    const freshChat = await seedArchivedChat("2026-05-31T00:00:00.000Z",);

    const summary = await runArchiveExpirationGc(db, {
      retentionDays: 30,
      logger: captured,
      now: NOW,
    },);

    expect(summary.scanned,).toBe(1,);
    expect(summary.purged,).toBe(1,);
    expect(summary.skipped,).toBe(0,);
    expect(
      await db.selectFrom("chats",).select("id",).where("id", "=", oldChat,).executeTakeFirst(),
    ).toBeUndefined();

    expect(
      await db.selectFrom("chats",).select("id",).where("id", "=", freshChat,).executeTakeFirst(),
    ).not.toBeUndefined();

    const auditLines = captured.entries.filter((entry,) =>
      entry.message === "archive gc purged chat" && entry.level === "info"
    );

    expect(auditLines,).toHaveLength(1,);
    expect(auditLines[0]?.meta?.chatId,).toBe(oldChat,);

    // log_entries: exactly one chat.archive_expired audit row, tied to the purged chat.
    const auditRows = await db
      .selectFrom("log_entries",)
      .select(["event_type", "entity_type", "entity_id", "user_id",],)
      .where("entity_id", "=", oldChat,)
      .execute();

    expect(auditRows,).toHaveLength(1,);
    expect(auditRows[0]?.event_type,).toBe("chat.archive_expired",);
    expect(auditRows[0]?.entity_type,).toBe("chat",);
    expect(auditRows[0]?.user_id,).toBe(ownerId,);
  });

  test("archived + new chat is skipped (within retention window)", async () => {
    const chatId = await seedArchivedChat("2026-05-20T00:00:00.000Z",);

    const summary = await runArchiveExpirationGc(db, {
      retentionDays: 30,
      logger: captured,
      now: NOW,
    },);

    expect(summary.scanned,).toBe(0,);
    expect(summary.purged,).toBe(0,);
    expect(summary.skipped,).toBe(0,);
    expect(
      await db.selectFrom("chats",).select("id",).where("id", "=", chatId,).executeTakeFirst(),
    ).not.toBeUndefined();

    // No audit row when nothing was purged.
    const auditRows = await db.selectFrom("log_entries",).select("id",).execute();
    expect(auditRows,).toHaveLength(0,);
  });

  test("already-deleted chat is a no-op", async () => {
    const summary = await runArchiveExpirationGc(db, {
      retentionDays: 30,
      logger: captured,
      now: NOW,
    },);

    expect(summary,).toEqual({ scanned: 0, purged: 0, skipped: 0, },);
  });

  test("retention days read from system_config when not overridden", async () => {
    await insertSystemConfig(db, "30", { key: "archive_retention_days", },);
    const oldChat = await seedArchivedChat("2025-01-01T00:00:00.000Z",);

    const summary = await runArchiveExpirationGc(db, {
      logger: captured,
      now: NOW,
    },);

    expect(summary.purged,).toBe(1,);
    expect(
      await db.selectFrom("chats",).select("id",).where("id", "=", oldChat,).executeTakeFirst(),
    ).toBeUndefined();
  });
});
