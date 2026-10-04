// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM-forced turn-skip support (TASK-chat-feature-turn-talkativity-skip AC5).
 *
 * Split from `turn-skip.ts` to keep that file under the 250L cap. Two
 * concerns: the authority gate for skipping ANOTHER participant's beat,
 * and the best-effort audit that records the override as a turn-state
 * transition through `state.ts`.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { recordForcedSkip, } from "../../../turning/turn-manager/state";
import { checkChatSettingsAccess, } from "../access";

/** Authority denial for a forced skip, shaped like the service result. */
export interface ForcedSkipDenial {
  ok: false;
  code: "forbidden";
  message: string;
}

/**
 * Authority gate: a caller may skip ANOTHER participant's beat only with
 * GM-tier authority (chat settings access: creator / GM / admin).
 * Self-skips (`actorId === userId`) are always allowed.
 * @param database
 * @param input - Chat, acting user, and the beat's target actor.
 * @returns A denial when the caller lacks authority; null to proceed.
 */
export async function checkForcedSkipAuthority(
  database: Kysely<DB>,
  input: { chatId: string; userId: string; userRole: string | null; actorId: string },
): Promise<ForcedSkipDenial | null> {
  if (input.actorId === input.userId) { return null; }
  const authority = await checkChatSettingsAccess(
    database,
    input.chatId,
    input.userId,
    input.userRole,
  );

  if (authority.ok) { return null; }
  return {
    ok: false,
    code: "forbidden",
    message: "Only the chat GM/owner can skip another participant's turn",
  };
}

/**
 * Best-effort audit of a fresh forced skip: appends the override to the
 * chat's turn state via `state.ts` (the auditable transition trail).
 * Never throws — the skip event itself has already landed as a message.
 * @param database
 * @param input - Chat, forced target, forcing user, and skip mode.
 * @returns {Promise<void>}
 */
export async function auditForcedSkip(
  database: Kysely<DB>,
  input: { chatId: string; actorId: string; userId: string; mode: "hold" | "advance" },
): Promise<void> {
  await recordForcedSkip(database, input.chatId, {
    actorId: input.actorId,
    byUserId: input.userId,
    at: new Date().toISOString(),
    mode: input.mode,
  },);
}
