// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Turn-skip event persistence (TASK-turn-skip-event-and-persistence).
 *
 * A skip is a first-class chat message: role=system, content_type=turn_skip.
 * There is no parallel tracking table — the cascade opt-out filter reads the
 * same messages log, so event log and story state cannot disagree.
 * Idempotency: retried posts within the same minute bucket replay the
 * stored row via the latest-message lookup (same actor + chat; latest row
 * with content_type=turn_skip is returned as `deduped: true`). A concurrent
 * retry within the bucket may produce two rows — caller is responsible for
 * not firing concurrent calls; the unique-index retry path was removed
 * because the messages.idempotency_key index is plain, not unique.
 */
import { type Kysely, sql, } from "kysely";
import {
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { isTelemetryEnabled, record as recordTelemetryEvent, } from "../../../telemetry/service";
import { safeJsonStringify, } from "../../../utils/safe-json";
import { checkChatAccess, } from "../access";

/** Skip mode: hold keeps the beat as-is; advance cues the next beat. */
export type TurnSkipMode = "hold" | "advance";

/** */
export interface RecordTurnSkipInput {
  chatId: string;
  /** Actor sitting the beat out (must be a chat participant). */
  actorId: string;
  mode: TurnSkipMode;
  reason?: string | null;
  userId: string;
  userRole: string | null;
}

/** */
export type RecordTurnSkipResult =
  | { ok: true; messageId: string; mode: TurnSkipMode; deduped: boolean }
  | { ok: false; code: "not_found" | "forbidden" | "refused_beat"; message: string };

/** One-minute retry window: same actor + chat + mode replays the first row. */
const DEDUP_BUCKET_MS = 60_000;

/** */
function dedupKey(chatId: string, actorId: string, mode: TurnSkipMode,): string {
  const bucket = Math.floor(Date.now() / DEDUP_BUCKET_MS,);
  return `turn_skip:${chatId}:${actorId}:${mode}:${bucket}`;
}

/**
 * Record a turn-skip event for an actor in a chat.
 *
 * Access mirrors message reads (`checkChatAccess`); the target actor must be
 * a chat participant. Interlock: an actor whose latest message is a
 * soft-refused beat (status=rejected) cannot also skip it (the refusal
 * consumed the beat); a hard send-gate block saves no row, so skip stays
 * available as the escape hatch.
 * @param database
 * @param input
 */
export async function recordTurnSkip(
  database: Kysely<DB>,
  input: RecordTurnSkipInput,
): Promise<RecordTurnSkipResult> {
  const access = await checkChatAccess(database, input.chatId, input.userId, input.userRole,);
  if (!access.ok) {
    return { ok: false, code: access.error.code as "not_found" | "forbidden", message: access.error.message, };
  }

  const participant = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", input.chatId,)
    .where("actor_id", "=", input.actorId,)
    .executeTakeFirst();
  if (!participant) {
    return { ok: false, code: "not_found", message: "Actor is not a participant of this chat", };
  }

  // Latest message by this actor in the chat (insertion order via rowid).
  const latest = await database
    .selectFrom("messages",)
    .select(["id", "status", "content_type", "idempotency_key",],)
    .where("chat_id", "=", input.chatId,)
    .where("actor_id", "=", input.actorId,)
    .orderBy(sql`rowid`, "desc",)
    .limit(1,)
    .executeTakeFirst();
  if (latest) {
    if (latest.content_type === MessageContentType.TurnSkip) {
      // Already sitting out — replay instead of stacking a second event.
      // Telemetry: cascade dedup (TASK-turn-skip-cascade). The dedup path
      // is the latest-message guard, NOT the bucket id — the dedupKey in
      // the stored row may be from a prior minute bucket, so we always
      // log a dedup event whenever the latest row is a turn_skip.
      if (isTelemetryEnabled()) {
        void recordTelemetryEvent(database, {
          eventType: "cascade.dedup.skip",
          chatId: input.chatId,
          userId: input.userId,
          data: { actorId: input.actorId, mode: input.mode, },
        },);
      }
      return { ok: true, messageId: latest.id, mode: input.mode, deduped: true, };
    }
    if (latest.status === MessageStatus.Rejected) {
      return {
        ok: false,
        code: "refused_beat",
        message: "Latest beat was refused by the consistency gate; skipping the same beat is not allowed",
      };
    }
  }

  const line = input.reason
    ? `skips this beat (${input.mode}) — ${input.reason}`
    : `skips this beat (${input.mode})`;

  const id = crypto.randomUUID();
  const metaResult = safeJsonStringify({ turnSkip: { mode: input.mode, reason: input.reason ?? null, }, },);
  const meta = metaResult.ok ? metaResult.value : null;
  await database
    .insertInto("messages",)
    .values({
      id,
      chat_id: input.chatId,
      actor_id: input.actorId,
      role: MessageRole.System,
      content: line,
      content_plaintext: line,
      content_type: MessageContentType.TurnSkip,
      content_format: MessageContentFormat.Markdown,
      content_encoding: ContentEncoding.Identity,
      status: MessageStatus.Confirmed,
      visibility: MessageVisibility.Visible,
      metadata: meta,
      idempotency_key: dedupKey(input.chatId, input.actorId, input.mode,),
    },)
    .execute();
  // Beat budget telemetry (TASK-turn-skip-cascade): each fresh skip
  // consumes one beat from this actor's per-chat budget. The gate
  // interlock (`TASK-turn-skip-gate-interlock`) reads the post-cascade
  // state via `countTurnSkipsForActor`; telemetry here keeps the count
  // observable without a dedicated counter table.
  if (isTelemetryEnabled()) {
    void recordTelemetryEvent(database, {
      eventType: "cascade.beat.consumed",
      chatId: input.chatId,
      userId: input.userId,
      data: { actorId: input.actorId, mode: input.mode, messageId: id, },
    },);
  }
  return { ok: true, messageId: id, mode: input.mode, deduped: false, };
}

/**
 * Count turn_skip events an actor has recorded in a chat.
 *
 * Reads the messages log directly — there is no separate counter table.
 * The gate interlock (`TASK-turn-skip-gate-interlock`) calls this to read
 * the post-cascade beat count; the telemetry events emitted from
 * `recordTurnSkip` carry the same count observably. A dedicated index on
 * `(chat_id, actor_id, content_type)` would let this become an index-only
 * scan; without one the query is a chat+actor range scan filtered by
 * `content_type = 'turn_skip'` (low-cardinality on most chats).
 * @param database
 * @param chatId
 * @param actorId
 */
export async function countTurnSkipsForActor(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<number> {
  const row = await database
    .selectFrom("messages",)
    .select((eb,) => eb.fn.count<number>("id",).as("n",))
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .where("content_type", "=", MessageContentType.TurnSkip,)
    .executeTakeFirst();
  return Number(row?.n ?? 0,);
}
