// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { TurnStrategy, } from "../../../db/enums-core/users";

/** Reason text surfaced in the UI when the gate blocks send. */
export type SendBlockedReason =
  | "no_active_chat"
  | "chat_paused"
  | "not_your_turn"
  | "no_actor_selected";

/** Validation outcome for a pre-send draft. */
export interface PreSendValidation {
  ok: boolean;
  mentionedActorIds: string[];
  unresolvedMentions: string[];
  isPassToken: boolean;
  isInitiativeClaim: boolean;
  unknownAssetRefs: string[];
}

/**
 * Inputs for the send gate. All fields are read off the existing ChatState
 * reactive surface — no async lookups.
 *
 * ponytail: ceiling — these fields are NOT yet populated on `ChatState`.
 * Wiring `turnOrder` / `turnStrategy` / `userActorId` / `currentActorIdForTurn` /
 * `isPaused` into the reactive `ChatState` aggregate is a follow-up scope change.
 */
export interface SendGateInputs {
  activeChat: string | null;
  isPaused: boolean;
  currentActorId: string | null;
  /**
   * Active impersonation target. When set, the gate treats the impersonated
   * actor as the speaker (the user is "playing as" them).
   */
  impersonatingActorId: string | null;
  /**
   * Turn strategy for the active chat. `null` ⇒ no gate (direct chats and
   * freeform roleplay).
   */
  turnStrategy: string | null;
  /**
   * Ordered list of actor ids eligible to speak under turn rules. Empty when
   * the strategy is not turn-based OR when the order has not been computed
   * yet (the chat is brand new).
   */
  turnOrder: string[];
  /**
   * Current speaker id. For round_robin / scene_based this is the actor
   * whose turn it currently is.
   */
  currentActorIdForTurn: string | null;
  /**
   * The actor id the message will be attributed to. For a human send this
   * is normally the user's own actor id, but it can be redirected via
   * impersonation (`impersonatingActorId`).
   */
  userActorId: string | null;
}

/**
 * Decide whether send is blocked under client-known state. Returns `null`
 * when send is allowed, or a `SendBlockedReason` describing why.
 * @param inputs
 */
export function computeSendBlocked(inputs: SendGateInputs,): SendBlockedReason | null {
  if (!inputs.activeChat) { return "no_active_chat"; }
  if (inputs.isPaused) { return "chat_paused"; }
  const resolvedActorId = inputs.impersonatingActorId ?? inputs.userActorId;
  if (!resolvedActorId) { return "no_actor_selected"; }
  const blockingStrategies = new Set<string>([TurnStrategy.RoundRobin, TurnStrategy.SceneBased,],);
  if (!inputs.turnStrategy || !blockingStrategies.has(inputs.turnStrategy,)) { return null; }
  if (inputs.turnOrder.length === 0) { return null; }
  const inOrder = inputs.turnOrder.includes(resolvedActorId,);
  const isCurrent = inputs.currentActorIdForTurn === resolvedActorId;
  if (!inOrder || !isCurrent) { return "not_your_turn"; }
  return null;
}

/**
 * Translate a `SendBlockedReason` into human-readable text for a tooltip /
 * aria-label. Caller picks the locale catalogue key — this function returns
 * a stable English fallback.
 * @param reason
 */
export function sendBlockedReasonText(reason: SendBlockedReason,): string {
  switch (reason) {
    case "no_active_chat": {
      return "Open a chat before sending.";
    }
    case "chat_paused": {
      return "Chat is paused.";
    }
    case "no_actor_selected": {
      return "Pick a character to send as.";
    }
    case "not_your_turn": {
      return "It's not your turn — wait for the current speaker.";
    }
  }
}

/** Reactive shape of the composer pre-send helpers when merged into ChatState. */
export interface ComposerPreSendState {
  _draftStorageKey: string;
  _draftTtlMs: number;
  _sendBlockedReason: SendBlockedReason | null;
  _sendBlockedHint: string;
  restoreDraft(chatId: string,): string | null;
  persistDraft(chatId: string, text: string,): void;
  isSendBlocked(inputs: SendGateInputs,): SendBlockedReason | null;
  /**
   * Read-only wrapper for the validator - exposed so the template can call
   * it inline (x-on:input="validateDraft($event.target.value)").
   */
  validateDraft(
    text: string,
    participants: { actorId: string; displayName: string }[],
    pendingAssetIds: string[],
  ): PreSendValidation;
}

/** Inputs the factory needs from the surrounding Alpine context. */
export interface ComposerPreSendDeps {
  storage?: Storage | null;
  /** Now-provider for tests; defaults to `Date.now`. */
  now?: () => number;
}
