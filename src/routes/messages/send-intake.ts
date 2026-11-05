// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/messages/send-intake.ts — the pre-insert intake phase of the
// send-message pipeline as a callable service.
//
// Split from `send-message.ts` for the 250L size gate. Every gate below ran
// verbatim inside the POST /chats/:id/messages handler before the extraction;
// the ordering is load-bearing and MUST NOT drift:
//  - whitespace trim rejects empty payloads before any side effect;
//  - access + mute gates run before NSFW flagging/profanity so a
//    non-participant cannot trigger moderation writes scoped to an arbitrary
//    chatId (BUG-nsfw-flag-side-effect-runs-before-access-check);
//  - the idempotency short-circuit runs before every side effect so a retried
//    POST returns the original row without re-running them;
//  - the VN decision gate deliberately runs AFTER that short-circuit (gating
//    earlier would turn an idempotent retry into a 409).

import type { Kysely, } from "kysely";
import { executeGmToolRequest, } from "../../assistant/gm-tool-execution";
import { ProactiveMessagingService, } from "../../chat/proactive";
import { checkChatAccess, } from "../../chat/service";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { parseAssetMentions, parseInitiativeFlag, stripAssetMentions, } from "../../group-chat/mention-parser";
import { containsProfanity, filter as filterProfanity, } from "../../profanity/service";
import type { MessageCreateBody, } from "../../validation/schemas";
import { badRequestResponse, jsonCreated, } from "../http-utils";
import { dispatchCommand, } from "./command";
import {
  enforceInjectionGate,
  enforceMuteGate,
  enforceVnDecisionGate,
} from "./guards";
import { serviceErrorToResponse, } from "./helpers";
import { flagNsfwUserMessage, } from "./nsfw-user-flag";
import { findByIdempotencyKey, } from "./swipe-race-insert";
import { translateInboundContent, } from "./translate-inbound";

/** Inputs for the intake phase; identity arrives pre-extracted. */
export interface SendIntakeParams {
  database: Kysely<DB>;
  config: Config;
  /** The sending user (actors.id === users.id for user principals). */
  userId: string;
  userRole: string | null;
  chatId: string;
  /** Route-validated body (MessageCreateBody.static); trimmed in-phase. */
  body: typeof MessageCreateBody.static;
}

/** The prepared message facts the storage phase consumes. */
export interface PreparedMessage {
  /** Body with the trimmed (and asset-mention-stripped) content. */
  effectiveBody: typeof MessageCreateBody.static;
  /** `@asset:<id>` ids captured before stripping (mention-derived attachments). */
  assetMentionIds: string[];
  /** Content after profanity filtering (what gets stored/rendered). */
  filteredContent: string;
  /** Whether the RAW content tripped the profanity detector. */
  hasProfanity: boolean;
  /** Whether the message claims the initiative (`!initiative`). */
  isInitiative: boolean;
  /** filteredContent, minus the initiative marker when claimed. */
  effectiveContent: string;
  /** Content after inbound translation negotiation (stored form). */
  storableContent: string;
}

/** Rejection Responses carry their own status; `ok` carries the prepared facts. */
export type SendIntakeOutcome =
  | { ok: false; response: Response }
  | { ok: true; prepared: PreparedMessage };

/**
 * Run every pre-insert gate and prepare the message for storage.
 * @param params - database/config handle, identity, chat id, body
 * @returns `{ ok: false, response }` to return verbatim, or the prepared facts
 */
export async function prepareUserMessage(params: SendIntakeParams,): Promise<SendIntakeOutcome> {
  const { database, config, userId: actorId, userRole, chatId, body, } = params;

  // BUG-message-whitespace-only-accepted: trim content and reject
  // whitespace-only payloads before any side effect (access check,
  // NSFW flag, profanity filter). Trailing/leading whitespace is
  // normalized here; mid-string whitespace is preserved.
  const trimmedContent = body.content.trim();
  if (trimmedContent.length === 0) {
    return { ok: false, response: badRequestResponse("Message content cannot be empty or whitespace-only.",), };
  }

  const effectiveBody = { ...body, content: trimmedContent, };

  // ── Access check before any side effects ───────────────────
  // See the module banner: moderation writes must not be reachable by
  // non-participants, and muted senders stop here too (Moderation AC3).
  const access = await checkChatAccess(database, chatId, actorId, userRole,);
  if (!access.ok) { return { ok: false, response: serviceErrorToResponse(access.error,), }; }

  const muteRejection = await enforceMuteGate(database, chatId, actorId,);
  if (muteRejection) { return { ok: false, response: muteRejection, }; }

  // ── Idempotency: short-circuit if a row already covers this key.
  // Runs before any side effect (NSFW audit, backoff resets,
  // slash-command dispatch, GM tools, mention/asset prep) so a
  // retried POST returns the original row without re-running them.
  // Empty string is "no key": storing "" would collide on the
  // migration 045 unique index.
  const idempotencyKey = body.idempotencyKey ? body.idempotencyKey : null;
  const existingId = idempotencyKey
    ? await findByIdempotencyKey(database, chatId, idempotencyKey,)
    : null;

  if (existingId) {
    return { ok: false, response: jsonCreated({ id: existingId, context: {}, },), };
  }

  // ── VN decision gate ────────────────────────────────────────
  // Deliberately AFTER the idempotency short-circuit above, not beside
  // enforceMuteGate: that block documents that a retried POST returns
  // the original row without re-running any side effect. Gating earlier
  // would turn an idempotent retry into a 409, which is exactly the bug
  // the short-circuit exists to prevent.
  //
  // Still precedes every real side effect (message row write, backoff
  // resets, GM tool execution), which is what makes the gate meaningful.
  const vnDecisionRejection = await enforceVnDecisionGate(database, chatId, actorId,);
  if (vnDecisionRejection) { return { ok: false, response: vnDecisionRejection, }; }

  // ── `@asset:<id>` attachment mentions (component-buttons AC6/AC4) ──
  // Capture the ids before translation/moderation see the text, then
  // strip the tokens so the timeline never renders raw `@asset:` markup.
  const assetMentionIds = parseAssetMentions(effectiveBody.content,);
  if (assetMentionIds.length > 0) {
    effectiveBody.content = stripAssetMentions(effectiveBody.content,);
  }

  const filteredContent = filterProfanity(effectiveBody.content,);
  const hasProfanity = containsProfanity(effectiveBody.content,);

  // ── NSFW content check on user message ─────────────────────
  // Lightweight flag/warn — does not suppress the message, just logs
  // when user-submitted content exceeds their max rating.
  await flagNsfwUserMessage(database, actorId, chatId, effectiveBody.content,);

  // ── Two-step prompt/message injection validation ─────────────
  // Opt-in via hooks.enableModerationHooks; a blocked verdict here
  // returns 403 before any message row is written.
  const injectionRejection = await enforceInjectionGate(
    config,
    database,
    effectiveBody.content,
    actorId,
    chatId,
  );

  if (injectionRejection) { return { ok: false, response: injectionRejection, }; }

  const { isInitiative, cleanMessage, } = parseInitiativeFlag(filteredContent,);
  const effectiveContent = isInitiative ? cleanMessage : filteredContent;

  // ── Proactive-messaging backoff reset ────────────────────────
  // When the user responds, reset the anti-spam backoff for every
  // character with proactive messaging enabled in this chat.
  const proactive = new ProactiveMessagingService(database,);
  const proactiveConfigs = await proactive.getChatConfigs(chatId,);
  for (const pc of proactiveConfigs) {
    if (pc.enabled) { await proactive.resetBackoff(chatId, pc.actorId,); }
  }

  // ── Slash command dispatch ────────────────────────────────
  const commandOutcome = await dispatchCommand(database, config, actorId, chatId, effectiveContent,);
  if (commandOutcome.handled) { return { ok: false, response: commandOutcome.response, }; }

  // ── GM natural-language tool execution (slash commands win) ──
  const gmOutcome = await executeGmToolRequest({
    database,
    config,
    actorId,
    chatId,
    content: effectiveContent,
  },);

  if (gmOutcome.handled) { return { ok: false, response: gmOutcome.response, }; }

  // Per-chat auto-translation (inbound) — opt-in; degrades to original.
  const storableContent = await translateInboundContent(database, config, chatId, actorId, filteredContent,);

  return {
    ok: true,
    prepared: {
      effectiveBody,
      assetMentionIds,
      filteredContent,
      hasProfanity,
      isInitiative,
      effectiveContent,
      storableContent,
    },
  };
}
