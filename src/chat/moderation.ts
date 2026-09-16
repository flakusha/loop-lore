// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat moderation — pure permission/state helpers + DB-backed primitives.
 *
 * Two surfaces live in this module:
 *
 * 1. **Pure layer** (existing) — `createModerationAction`,
 *    `checkModerationPermission`, `isBlocked`, `isBanned`,
 *    `getShadowState`. No I/O; exercised by `moderation.test.ts` and by
 *    any caller that needs to make a decision without hitting the DB.
 *
 * 2. **DB-backed primitives** (new, TASK-chat-feature-moderation) —
 *    `applyBan`, `applyKick`, `applyMute`, `applyFlag`. Each opens a
 *    transaction, writes a `moderation_actions` row + a `log_entries`
 *    audit row (the latter queryable via `src/middleware/nsfw-gate/logging.ts`
 *    for compliance), and returns the audit entry id.
 *
 * `applyFlag` further delegates to
 * `src/generation/hooks/moderation-hook.ts` for `flag-nsfw` so the
 * severity/keyword scoring pipeline is shared with content scans. The
 * `flag-tox` kind is the same audit path with a different severity tag,
 * used for toxicity / off-topic escalation that the hook did not fire
 * on (e.g. user-reported, not auto-detected).
 */
import { type Kysely, } from "kysely";
import { type DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { ModerationHook, } from "../generation/hooks/moderation-hook";
import { can, } from "../users/permissions";
import type {
  ApplyOptions,
  ApplyResult,
  ModerationAction,
  ModerationActionKind,
  ModerationActionType,
  ModerationAuditEntry,
  ModerationEventType,
  ModerationScope,
  ModerationSeverity,
} from "./types";

// ─── Pure Layer (existing, unchanged behavior) ──────────────────────────

/**
 * Create an in-memory moderation action record. Pure — does not persist.
 * @param params
 */
export function createModerationAction(params: {
  type: ModerationActionType;
  targetActorId: string;
  scope: ModerationScope;
  actorId: string;
  reason?: string;
  internal?: boolean;
},): ModerationAction {
  return {
    type: params.type,
    targetActorId: params.targetActorId,
    scope: params.scope,
    actorId: params.actorId,
    reason: params.reason,
    internal: params.internal ?? true,
  };
}

/**
 * Check if a moderation action is allowed.
 *
 * Rules:
 * - Users cannot moderate themselves.
 * - Only admins/owners can ban.
 * - Chat owners / admins can shadow/collapse within a chat.
 * - Anyone can flag (internal report) or block another user.
 * @param action
 * @param callerRole
 * @param isTargetSelf
 */
export function checkModerationPermission(
  action: ModerationAction,
  callerRole: string,
  isTargetSelf: boolean,
): { allowed: boolean; reason?: string } {
  if (isTargetSelf) {
    return { allowed: false, reason: "Cannot moderate yourself", };
  }

  switch (action.type) {
    case "ban": {
      if (!can(callerRole, "admin.chat",) && callerRole !== "owner") {
        return { allowed: false, reason: "Only admins can ban users", };
      }
      break;
    }

    case "shadow":
    case "collapse": {
      if (callerRole !== "owner" && !can(callerRole, "admin.chat",) && action.scope === "chat") {
        return { allowed: false, reason: "Only chat owners can shadow/collapse messages", };
      }
      break;
    }

    case "block":
    case "flag":
      // Any authenticated user may block or flag.
      break;
  }

  return { allowed: true, };
}

/**
 * Check if a user is blocked in a given scope.
 * @param blocks
 * @param targetActorId
 * @param scope
 */
export function isBlocked(
  blocks: ModerationAction[],
  targetActorId: string,
  scope: ModerationScope,
): boolean {
  for (const b of blocks) {
    if (
      b.type === "block" &&
      b.targetActorId === targetActorId &&
      (b.scope === scope || b.scope === "global")
    ) { return true; }
  }
  return false;
}

/**
 * Check if a user is banned.
 * @param bans
 * @param targetActorId
 */
export function isBanned(bans: ModerationAction[], targetActorId: string,): boolean {
  for (const b of bans) {
    if (b.type === "ban" && b.targetActorId === targetActorId) { return true; }
  }
  return false;
}

/**
 * Check if a viewer is affected by shadow/collapse actions.
 * @param actions
 * @param viewerId
 */
export function getShadowState(
  actions: ModerationAction[],
  viewerId: string,
): "shadow" | "collapse" | null {
  for (const a of actions) {
    if (a.type === "shadow" && a.targetActorId === viewerId) { return "shadow"; }
    if (a.type === "collapse" && a.targetActorId === viewerId) { return "collapse"; }
  }
  return null;
}

// ─── DB-backed Primitives ───────────────────────────────────────────────

/** Action-type column values written to `moderation_actions.action_type`. */
const ACTION_TYPE_BY_KIND: Record<ModerationActionKind, string> = {
  "ban": "chat_ban",
  "kick": "chat_kick",
  "mute": "chat_mute",
  "flag-nsfw": "flag_nsfw",
  "flag-tox": "flag_toxicity",
};

/** Audit `log_entries.event_type` strings. */
const EVENT_TYPE_BY_KIND: Record<ModerationActionKind, ModerationEventType> = {
  "ban": "moderation.chat.ban",
  "kick": "moderation.chat.kick",
  "mute": "moderation.chat.mute",
  "flag-nsfw": "moderation.chat.flag.nsfw",
  "flag-tox": "moderation.chat.flag.tox",
};

/** Severity → log level (mirrors `nsfw/pii-redaction` constants). */
const LEVEL_BY_SEVERITY: Record<ModerationSeverity, number> = {
  info: 6,
  warn: 4,
  severe: 3,
};

/**
 * Default mute duration when the caller omits `durationMs`. 1 hour.
 * Short enough that accidents expire on their own; long enough to cover
 * a typical "cool-off" window.
 */
const DEFAULT_MUTE_DURATION_MS = 60 * 60 * 1000;

/** Reason text used when the caller doesn't pass one. */
const DEFAULT_REASON = "(no reason provided)";

/**
 * Insert the `moderation_actions` + `log_entries` audit pair inside the
 * caller's transaction. Both rows share the same generated id (a UUID),
 * so the audit trail can be cross-referenced with the action record by
 * `log_entries.action = "<kind>"` and `metadata.action_id`.
 *
 * Kept private — only the `apply*` primitives call it.
 */
async function writeAuditPair(
  trx: Kysely<DB>,
  args: {
    kind: ModerationActionKind;
    severity: ModerationSeverity;
    chatId: string;
    targetActorId: string;
    byActorId: string;
    scope: ModerationScope;
    reason?: string;
    durationMs?: number;
    extraMeta?: Record<string, unknown>;
  },
): Promise<{ actionId: string; auditEntryId: string; }> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const iso = new Date(now,).toISOString();
  const level = LEVEL_BY_SEVERITY[args.severity];
  const actionType = ACTION_TYPE_BY_KIND[args.kind];
  const eventType = EVENT_TYPE_BY_KIND[args.kind];
  const expiresAt = args.durationMs
    ? new Date(now + args.durationMs,).toISOString()
    : null;
  const reason = args.reason ?? DEFAULT_REASON;

  const meta: Record<string, unknown> = {
    scope: args.scope,
    by_actor_id: args.byActorId,
    target_actor_id: args.targetActorId,
    chat_id: args.chatId,
    action_id: id,
    reason,
    severity: args.severity,
    ...(args.durationMs !== undefined ? { duration_ms: args.durationMs, } : {}),
    ...(args.extraMeta ?? {}),
  };

  await trx
    .insertInto("moderation_actions",)
    .values({
      id,
      action_type: actionType,
      target_user_id: args.targetActorId,
      performed_by: args.byActorId,
      reason,
      scope: args.scope,
      scope_id: args.chatId,
      metadata: JSON.stringify(meta,),
      expires_at: expiresAt,
      created_at: iso,
    },)
    .execute();

  await trx
    .insertInto("log_entries",)
    .values({
      id,
      level,
      timestamp: now,
      time: iso,
      message: `${args.kind} on ${args.targetActorId} in chat ${args.chatId}: ${reason}`,
      module: "chat-moderation",
      user_id: args.byActorId,
      entity_type: "actor",
      entity_id: args.targetActorId,
      action: args.kind,
      event_type: eventType,
      meta: JSON.stringify(meta,),
    },)
    .execute();

  return { actionId: id, auditEntryId: id, };
}

/**
 * **Apply a ban.**
 *
 * - Stamps `chat_participants.banned_until` (or deletes the row when
 *   `durationMs` is not provided → indefinite scope-wide ban that
 *   prevents rejoin via `applyKick`/`applyMute` join logic upstream).
 * - Writes the audit pair.
 *
 * Callers MUST gate this with `checkChatSettingsAccess` (or
 * `can(callerRole, "moderation.action")`) before invocation.
 * @param db
 * @param opts
 */
export async function applyBan(db: Kysely<DB>, opts: ApplyOptions,): Promise<ApplyResult> {
  if (opts.targetActorId === opts.byActorId) {
    return { ok: false, reason: "Cannot ban yourself", };
  }
  if (!opts.chatId) {
    return { ok: false, reason: "chatId is required", };
  }

  const now = Date.now();
  // When no duration is given the ban is indefinite. Encode that as a
  // far-future timestamp (year 9999) so the `isParticipantBanned`
  // predicate — which only requires `banned_until > now` — returns true
  // for any caller that ever reads the row. A `null` would mean
  // "not banned", which contradicts the action's intent.
  const INDEFINITE_BAN_ISO = "9999-12-31T23:59:59.999Z";
  const bannedUntil = opts.durationMs
    ? new Date(now + opts.durationMs,).toISOString()
    : INDEFINITE_BAN_ISO;

  const result = await db.transaction().execute(async (trx,) => {
    // Stamp ban state on existing participant row, if present.
    const existing = await trx
      .selectFrom("chat_participants",)
      .select("chat_id",)
      .where("chat_id", "=", opts.chatId,)
      .where("actor_id", "=", opts.targetActorId,)
      .executeTakeFirst();

    if (existing) {
      await trx
        .updateTable("chat_participants",)
        .set({ banned_until: bannedUntil, muted_until: null, },)
        .where("chat_id", "=", opts.chatId,)
        .where("actor_id", "=", opts.targetActorId,)
        .execute();
    }
    // No row insertion: a banned user is not a participant.

    return writeAuditPair(trx, {
      kind: "ban",
      severity: "severe",
      chatId: opts.chatId,
      targetActorId: opts.targetActorId,
      byActorId: opts.byActorId,
      scope: opts.scope,
      reason: opts.reason,
      durationMs: opts.durationMs,
      extraMeta: { banned_until: bannedUntil, },
    },);
  },);

  getLogger().child({ module: "chat-moderation", },).info("ban applied", {
    chatId: opts.chatId,
    targetActorId: opts.targetActorId,
    byActorId: opts.byActorId,
    bannedUntil,
    auditEntryId: result.auditEntryId,
  },);

  return {
    ok: true,
    auditEntryId: result.auditEntryId,
    actionId: result.actionId,
  };
}

/**
 * **Apply a kick.**
 *
 * - Deletes the `chat_participants` row for the target (history
 *   preserved; the target may rejoin via the invite/join flow).
 * - Writes the audit pair. Re-inserting the target via the normal join
 *   path is not blocked by a kick (unlike ban).
 * @param db
 * @param opts
 */
export async function applyKick(db: Kysely<DB>, opts: ApplyOptions,): Promise<ApplyResult> {
  if (opts.targetActorId === opts.byActorId) {
    return { ok: false, reason: "Cannot kick yourself", };
  }
  if (!opts.chatId) {
    return { ok: false, reason: "chatId is required", };
  }

  const result = await db.transaction().execute(async (trx,) => {
    await trx
      .deleteFrom("chat_participants",)
      .where("chat_id", "=", opts.chatId,)
      .where("actor_id", "=", opts.targetActorId,)
      .execute();

    return writeAuditPair(trx, {
      kind: "kick",
      severity: "warn",
      chatId: opts.chatId,
      targetActorId: opts.targetActorId,
      byActorId: opts.byActorId,
      scope: opts.scope,
      reason: opts.reason,
    },);
  },);

  getLogger().child({ module: "chat-moderation", },).info("kick applied", {
    chatId: opts.chatId,
    targetActorId: opts.targetActorId,
    byActorId: opts.byActorId,
    auditEntryId: result.auditEntryId,
  },);

  return {
    ok: true,
    auditEntryId: result.auditEntryId,
    actionId: result.actionId,
  };
}

/**
 * **Apply a mute.**
 *
 * - Sets `chat_participants.muted_until = now + duration` (default 1h).
 * - Does NOT delete the participant row — the user remains in the chat
 *   but `isMuted(participant, now)` returns true until expiry.
 * - Writes the audit pair with the `expires_at` value mirrored in
 *   `metadata.duration_ms` for compliance replay.
 * @param db
 * @param opts
 */
export async function applyMute(db: Kysely<DB>, opts: ApplyOptions,): Promise<ApplyResult> {
  if (opts.targetActorId === opts.byActorId) {
    return { ok: false, reason: "Cannot mute yourself", };
  }
  if (!opts.chatId) {
    return { ok: false, reason: "chatId is required", };
  }

  const duration = opts.durationMs ?? DEFAULT_MUTE_DURATION_MS;
  const now = Date.now();
  const mutedUntil = new Date(now + duration,).toISOString();

  const result = await db.transaction().execute(async (trx,) => {
    // Only stamp existing participants — a mute does not implicitly
    // re-add a removed user.
    await trx
      .updateTable("chat_participants",)
      .set({ muted_until: mutedUntil, },)
      .where("chat_id", "=", opts.chatId,)
      .where("actor_id", "=", opts.targetActorId,)
      .execute();

    return writeAuditPair(trx, {
      kind: "mute",
      severity: "warn",
      chatId: opts.chatId,
      targetActorId: opts.targetActorId,
      byActorId: opts.byActorId,
      scope: opts.scope,
      reason: opts.reason,
      durationMs: duration,
      extraMeta: { muted_until: mutedUntil, },
    },);
  },);

  getLogger().child({ module: "chat-moderation", },).info("mute applied", {
    chatId: opts.chatId,
    targetActorId: opts.targetActorId,
    byActorId: opts.byActorId,
    mutedUntil,
    auditEntryId: result.auditEntryId,
  },);

  return {
    ok: true,
    auditEntryId: result.auditEntryId,
    actionId: result.actionId,
  };
}

/**
 * **Apply a flag.**
 *
 * - `flag-nsfw` — runs the content through
 *   `src/generation/hooks/moderation-hook.ts` so severity/keyword scoring
 *   is consistent with auto-detection; the hook's `ModerationHook.execute`
 *   call produces a `HookResult` whose `data.severity` is mapped to our
 *   audit `severity` bucket.
 * - `flag-tox` — the same audit path with `severity = "warn"` (the hook's
 *   moderate bucket) since user-reported toxicity did not auto-fire.
 *
 * No participant row mutation; flags are pure audit records that feed
 * downstream review tooling via `log_entries.event_type`. The
 * discriminator is read from `opts.kind` (set by the route layer);
 * defaults to `flag-nsfw` for back-compat.
 * @param db
 * @param opts
 * @param content - Content body to scan (required for `flag-nsfw`;
 *   ignored for `flag-tox`).
 */
export async function applyFlag(
  db: Kysely<DB>,
  opts: ApplyOptions,
  content?: string,
): Promise<ApplyResult> {
  if (!opts.chatId) {
    return { ok: false, reason: "chatId is required", };
  }

  const kind: ModerationActionKind = opts.kind === "flag-tox" ? "flag-tox" : "flag-nsfw";
  let severity: ModerationSeverity = kind === "flag-tox" ? "warn" : "warn";

  if (kind === "flag-nsfw" && opts.scope === "chat" && content && content.length > 0) {
    const hook = new ModerationHook();
    const hookResult = await hook.execute(content, {
      actorId: opts.targetActorId,
      userId: opts.byActorId,
      chatId: opts.chatId,
      content,
      config: {} as never,
      nsfwConfig: {} as never,
      db,
    },);
    const data = (hookResult.data ?? {}) as { severity?: string };
    if (data.severity === "severe") { severity = "severe"; }
  }

  const result = await db.transaction().execute(async (trx,) => {
    return writeAuditPair(trx, {
      kind,
      severity,
      chatId: opts.chatId,
      targetActorId: opts.targetActorId,
      byActorId: opts.byActorId,
      scope: opts.scope,
      reason: opts.reason,
      extraMeta: { content_length: content?.length ?? 0, },
    },);
  },);

  return {
    ok: true,
    auditEntryId: result.auditEntryId,
    actionId: result.actionId,
  };
}

/**
 * **Pure mute predicate.** The single source of truth for whether a
 * participant's traffic (inbound or outbound) should be suppressed.
 *
 * Returns true when `muted_until` is set AND strictly greater than
 * `now` (passed in for testability). Pass `Date.now()` in production;
 * pass a fixed value in unit tests.
 *
 * The companion `applyMute` primitive is the only writer that should
 * stamp `muted_until`; this predicate never trusts `expires_at` from
 * `moderation_actions` — it always re-reads `chat_participants`.
 * @param participant - A `chat_participants` row (only `muted_until` is consulted).
 * @param now - Reference timestamp in ms.
 */
export function isMuted(
  participant: { muted_until: string | null } | null | undefined,
  now: number,
): boolean {
  if (!participant || !participant.muted_until) { return false; }
  // ISO-8601 strings sort lexicographically — safe for `>` comparison.
  const expiry = Date.parse(participant.muted_until,);
  if (Number.isNaN(expiry,)) { return false; }
  return expiry > now;
}

/**
 * **Pure ban predicate.** True iff `banned_until` is set AND strictly
 * greater than `now`. A null `banned_until` means "not banned" and the
 * join path will admit the target freely.
 * @param participant
 * @param now
 */
export function isParticipantBanned(
  participant: { banned_until: string | null } | null | undefined,
  now: number,
): boolean {
  if (!participant || !participant.banned_until) { return false; }
  const expiry = Date.parse(participant.banned_until,);
  if (Number.isNaN(expiry,)) { return false; }
  return expiry > now;
}

/**
 * Re-export the audit-entry shape so consumers can type-narrow the
 * row returned from `log_entries` queries without importing from
 * `./types` directly.
 */
export type { ModerationAuditEntry, };
