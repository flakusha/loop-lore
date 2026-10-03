// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Keyphrase-triggered journal recall hook for the memories section
 * (TASK-KEYPHRASE-RECALL).
 *
 * Runs at prompt assembly — never in the SSE transport: the recent
 * user/character messages are scanned against the provisioned journal
 * entries' keyphrases, and hits are forced into THIS prompt past the
 * probabilistic injection filter. Entries only ever reach this hook after
 * passing the provision/privacy gate in `memories.ts`. Forced entries are
 * bounded by the per-message limit (config `memory_keyphrase_recall_limit`,
 * default 3) and each injection starts a per-(chat, memory) cooldown so the
 * same entry is not re-forced every turn.
 *
 * Config keys (system_config; seeded by admin/config.seedDefaults):
 *   - `memory_keyphrase_recall`        — "false"|"0"|"off"|"no" disables
 *   - `memory_keyphrase_recall_limit`  — per-message cap (default 3, max 20)
 */
import type { Kysely, } from "kysely";
import { getConfigValue, } from "../../../admin/config";
import { MessageRole, MessageStatus, MessageVisibility, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { type AuditLogEntry, recordAuditLog, } from "../../../memory/audit";
import {
  DEFAULT_MAX_KEYPHRASE_RECALLS,
  findKeyphraseMatches,
  keyphraseRecallAllowed,
  recordKeyphraseRecall,
} from "../../../memory/keyphrase-recall";
import type { MemoryEntry, } from "../../../memory/types";
import { resolveMessageContent, } from "../../../routes/messages/helpers";

const ENABLE_FLAG_KEY = "memory_keyphrase_recall";
const LIMIT_KEY = "memory_keyphrase_recall_limit";
/** Recent message window scanned for keyphrases (user + AI, both directions). */
const RECENT_MESSAGE_WINDOW = 4;
/** Hard cap so a misconfigured limit cannot flood the prompt. */
const MAX_LIMIT = 20;
const DISABLED_VALUES = new Set(["false", "0", "off", "no",],);

/** Narrow view of the prompt-assembly context this hook needs. */
export interface KeyphraseRecallCtx {
  db: Kysely<DB>;
  chat: { id: string };
  actor: { id: string };
  params: { userId?: string };
}

/**
 * @param raw - stored config value
 * @returns per-message recall limit (default 3, clamped to [0, MAX_LIMIT])
 */
function parseLimit(raw: string | undefined,): number {
  if (raw === undefined) { return DEFAULT_MAX_KEYPHRASE_RECALLS; }
  const n = Number.parseInt(raw, 10,);
  if (!Number.isFinite(n,) || n < 0) { return DEFAULT_MAX_KEYPHRASE_RECALLS; }
  return Math.min(n, MAX_LIMIT,);
}

/**
 * Fetch + decrypt the recent message window (user and AI roles), newest
 * first. Corrupt payloads are skipped and logged — a bad row must not break recall.
 * @param ctx
 * @returns joined message text, or "" when nothing readable exists
 */
async function recentMessageText(ctx: KeyphraseRecallCtx,): Promise<string> {
  const rows = await ctx.db
    .selectFrom("messages",)
    .select(["content", "content_encoding", "key_id", "actor_id",],)
    .where("chat_id", "=", ctx.chat.id,)
    .where("status", "=", MessageStatus.Confirmed,)
    .where("visibility", "=", MessageVisibility.Visible,)
    .where("role", "in", [MessageRole.User, MessageRole.Assistant, MessageRole.Character,],)
    .orderBy("created_at", "desc",)
    .limit(RECENT_MESSAGE_WINDOW,)
    .execute();
  const parts: string[] = [];
  for (const row of rows) {
    try {
      parts.push(await resolveMessageContent(ctx.db, { ...row, chat_id: ctx.chat.id, },),);
    } catch (err) {
      getLogger().child({ module: "memories-keyphrase", },).warn("skipping unreadable message", err,);
    }
  }
  return parts.join("\n",);
}

/**
 * Match recent messages against journal keyphrases, honoring the config
 * flag, the per-message limit, and the per-(chat, memory) cooldown.
 * @param ctx - prompt-assembly context (db/chat/actor/user)
 * @param entries - provisioned, privacy-cleared journal entries
 * @returns entries to force into this prompt (in input order)
 */
export async function collectKeyphraseHits(
  ctx: KeyphraseRecallCtx,
  entries: readonly MemoryEntry[],
): Promise<MemoryEntry[]> {
  if (entries.length === 0) { return []; }
  const enabled = await getConfigValue(ctx.db, ENABLE_FLAG_KEY,);
  if (enabled !== undefined && DISABLED_VALUES.has(enabled.trim().toLowerCase(),)) { return []; }
  const limit = parseLimit(await getConfigValue(ctx.db, LIMIT_KEY,),);
  if (limit === 0) { return []; }
  const text = await recentMessageText(ctx,);
  if (text === "") { return []; }
  const now = Date.now();
  const candidates = entries.filter(
    (entry,) =>
      entry.keywords.length > 0 &&
      keyphraseRecallAllowed({ chatId: ctx.chat.id, memoryId: entry.id, now, },),
  );

  if (candidates.length === 0) { return []; }
  const matched = findKeyphraseMatches({ text, entries: candidates, maxMatches: limit, },);
  const matchedIds = new Set(matched.map((entry,) => entry.id),);
  return candidates.filter((entry,) => matchedIds.has(entry.id,));
}

/**
 * Merge keyphrase hits into the injected set: forced entries bypass the
 * probabilistic filter (bounded by the per-message limit), start their
 * cooldown, and are recorded in the memory audit log with
 * `details.keyphrase = true` so the recall is observable.
 * @param ctx
 * @param selected - entries the normal injection pipeline selected
 * @param hits - matches from {@link collectKeyphraseHits}
 * @param now - injectable clock for tests
 * @returns the final injected list (selected first, deduped)
 */
export async function applyKeyphraseRecalls(
  ctx: KeyphraseRecallCtx,
  selected: MemoryEntry[],
  hits: readonly MemoryEntry[],
  now: number = Date.now(),
): Promise<MemoryEntry[]> {
  const alreadySelected = new Set(selected.map((entry,) => entry.id),);
  const forced = hits.filter((entry,) => !alreadySelected.has(entry.id,));
  if (forced.length === 0) { return selected; }
  for (const entry of forced) {
    recordKeyphraseRecall({ chatId: ctx.chat.id, memoryId: entry.id, now, },);
  }

  // One audit row per ACTOR, matching `memories.ts`: a single row stamped with
  // the first entry's actorId would misattribute every other forced entry's
  // memory to that actor in the audit trail.
  const byActor = new Map<string, MemoryEntry[]>();
  for (const entry of forced) {
    const actorId = entry.actorId ?? ctx.actor.id;
    const group = byActor.get(actorId,);
    if (group) { group.push(entry,); }
    else { byActor.set(actorId, [entry,],); }
  }

  await recordAuditLog(
    ctx.db,
    [...byActor,].map(([actorId, group,],): AuditLogEntry => ({
      memoryId: group[0]!.id,
      actorId,
      userId: ctx.params.userId ?? null,
      action: "inject",
      details: {
        chatId: ctx.chat.id,
        keyphrase: true,
        keyphraseIds: group.map((entry,) => entry.id),
      },
    })),
  );

  return [...selected, ...forced,];
}
