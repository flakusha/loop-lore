// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Carriage channel — dev/admin-visible records of cross-context state
 * carried between sections, parties, and sessions
 * (TASK-chat-feature-notes-shadow-carriage AC3).
 *
 * Participants never see carriage rows: the only read path is the
 * admin-gated `GET /api/admin/chats/:id/carriage` endpoint, and no
 * chat-scoped route selects from `carriage_records`. Developers get a
 * structured log line per record plus direct DB rows.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";

/** Context boundary a carriage record describes. */
export const CARRIAGE_SCOPES = ["section", "party", "session",] as const;

/** One of `section` / `party` / `session`. */
export type CarriageScope = (typeof CARRIAGE_SCOPES)[number];

/** Persisted carriage row (payload held as a JSON string). */
export interface CarriageRecord {
  id: string;
  chatId: string;
  /** Origin chat of the carry; survives source-chat deletion. */
  sourceChatId: string | null;
  scope: CarriageScope;
  payload: string;
  createdAt: string;
}

/** Input for `recordCarriage`. */
export interface RecordCarriageInput {
  /** Chat the carried state now lives in (the destination). */
  chatId: string;
  sourceChatId?: string | null;
  scope: CarriageScope;
  payload: Record<string, unknown>;
}

/**
 * Type guard for carriage scopes.
 * @param value - candidate value
 * @returns true when value is a known scope
 */
export function isCarriageScope(value: unknown,): value is CarriageScope {
  return typeof value === "string" &&
    (CARRIAGE_SCOPES as readonly string[]).includes(value,);
}

/**
 * Persist one carriage record and emit the structured dev log line.
 * @param db
 * @param input
 * @returns The stored record.
 * @throws {Error} when `input.scope` is not a known carriage scope.
 */
export async function recordCarriage(
  db: Kysely<DB>,
  input: RecordCarriageInput,
): Promise<CarriageRecord> {
  if (!isCarriageScope(input.scope,)) {
    throw new Error(`Invalid carriage scope: ${String(input.scope,)}`,);
  }

  const payload = (() => {
    const r = safeJsonStringify(input.payload,);
    return r.ok ? r.value : "{}";
  })();

  const record: CarriageRecord = {
    id: crypto.randomUUID(),
    chatId: input.chatId,
    sourceChatId: input.sourceChatId ?? null,
    scope: input.scope,
    payload,
    createdAt: new Date().toISOString(),
  };

  await db
    .insertInto("carriage_records",)
    .values({
      id: record.id,
      chat_id: record.chatId,
      source_chat_id: record.sourceChatId,
      scope: record.scope,
      payload: record.payload,
      created_at: record.createdAt,
    },)
    .execute();

  getLogger()
    .child({ module: "chat.carriage", },)
    .info("carriage recorded", {
      chatId: record.chatId,
      sourceChatId: record.sourceChatId,
      scope: record.scope,
    },);

  return record;
}

/**
 * List carriage rows for one chat, newest-first (admin/dev read path).
 * @param db
 * @param chatId
 * @param opts
 * @param opts.limit - row cap (clamped to 1..500; default 100)
 * @returns Matching carriage records.
 */
export async function listCarriage(
  db: Kysely<DB>,
  chatId: string,
  opts: { limit?: number } = {},
): Promise<CarriageRecord[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100,), 500,);
  const rows = await db
    .selectFrom("carriage_records",)
    .select(["id", "chat_id", "source_chat_id", "scope", "payload", "created_at",],)
    .where("chat_id", "=", chatId,)
    .limit(limit,)
    .orderBy("created_at", "desc",)
    .execute();

  return rows.map((row,) => ({
    id: row.id,
    chatId: row.chat_id,
    sourceChatId: row.source_chat_id,
    scope: row.scope as CarriageScope,
    payload: row.payload,
    createdAt: row.created_at,
  }));
}
