// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW intimacy interface — shared view-model types and the action catalog
 * (EPIC-NSFW-UI Phase 1, TASK-nsfw-intimacy-interface).
 *
 * The catalog is the UI's source of truth for what the intimacy panel
 * offers: the backend route (`POST /api/v1/nsfw/intimacy/action`) accepts
 * the full action descriptor from the client, so every catalog entry maps
 * 1:1 onto a wire payload. `actionType` values mirror the server enum
 * `IntimacyActionType` (src/db/enums-character/nsfw.ts:22-28) as a local
 * literal union — intentionally NOT a cross-boundary import, so the
 * frontend bundle never depends on server modules (a server-side addition
 * degrades to "not offered in the UI", never to a broken build).
 */

import { t, } from "../alpine/i18n";

// ── Wire vocabulary ────────────────────────────────────────

/** Action categories the server's intimacy schema accepts. */
export type IntimacyActionType =
  | "verbal"
  | "physical"
  | "gift"
  | "service"
  | "intimate";

/** One selectable intimacy action (catalog entry → wire payload). */
export interface IntimacyActionView {
  /** Stable id sent as `actionId`. */
  id: string;
  /** i18n key of the display name (`nsfw.intimacy.action.<id>`). */
  nameKey: string;
  /** i18n key of the description line (`nsfw.intimacy.actionDesc.<id>`). */
  descriptionKey: string;
  /** Server enum value sent as `actionType`. */
  type: IntimacyActionType;
  /** Score delta sent as `delta` (positive = build). */
  delta: number;
  /** Minimum pair score sent as `minIntimacy`. */
  minIntimacy: number;
  /** Whether the confirm-consent phase gates this action. */
  requiresConsent: boolean;
}

/** A selectable target partner (chat participant other than the character). */
export interface IntimacyPartnerOption {
  /** Actor id of the target. */
  actorId: string;
  /** Display name resolved from the chat's participants. */
  displayName: string;
}

/** One unlocked threshold event from the apply result. */
export interface IntimacyThresholdView {
  /** Level that fired. */
  level: number;
  /** Server-provided label. */
  label: string;
  /** Server-provided unlock description. */
  unlock: string;
}

/** Result payload of a successful apply (`ApplyIntimacyResult` wire shape). */
export interface IntimacyApplyOutcome {
  /** New intimacy score after applying the action. */
  newScore: number;
  /** Score change (may be modified by server-side conditions). */
  actualDelta: number;
  /** Whether the action was applied. */
  applied: boolean;
  /** Server reason when not applied. */
  reason?: string;
  /** Threshold events that fired. */
  thresholdsReached: IntimacyThresholdView[];
  /** Relationship-upgrade suggestion, when one fired. */
  suggestedRelationshipUpgrade?: string;
}

// ── Flow vocabulary ────────────────────────────────────────

/** Why the flow parked in the error phase. */
export type IntimacyErrorKind =
  | "consent"
  | "target"
  | "validation"
  | "auth"
  | "network";

/** Classified failure carried by the error phase. */
export interface IntimacyError {
  /** Stable kind driving the error UI. */
  kind: IntimacyErrorKind;
  /** Raw server message, when one was returned. */
  message?: string;
}

/** The intimacy flow's discrete phases (plan §4 state machine). */
export type IntimacyPhase =
  | "idle"
  | "partnerSelect"
  | "actionSelect"
  | "confirmConsent"
  | "applying"
  | "effects"
  | "error";

/** Full state of the intimacy flow; transitions live in `intimacy-scene.ts`. */
export interface IntimacyFlowState {
  /** Current phase. */
  phase: IntimacyPhase;
  /** Selected partner (set from `partnerSelect` onward). */
  partner: IntimacyPartnerOption | null;
  /** Selected action (set from `actionSelect` onward). */
  action: IntimacyActionView | null;
  /** Successful apply result (set in the `effects` phase). */
  outcome: IntimacyApplyOutcome | null;
  /** Classified failure (set in the `error` phase). */
  error: IntimacyError | null;
}

/** Events the mixin feeds into the reducer. */
export type IntimacyFlowEvent =
  | { type: "open"; partners: IntimacyPartnerOption[] }
  | { type: "selectPartner"; partner: IntimacyPartnerOption }
  | { type: "selectAction"; action: IntimacyActionView }
  | { type: "confirmConsent" }
  | { type: "cancelConsent" }
  | { type: "applied"; outcome: IntimacyApplyOutcome }
  | { type: "failed"; error: IntimacyError }
  | { type: "back" }
  | { type: "continue" }
  | { type: "close" };

/** Initial flow state (also the reset target). */
export function initialFlowState(): IntimacyFlowState {
  return { phase: "idle", partner: null, action: null, outcome: null, error: null, };
}

/** Localized display name of a catalog action. */
export function actionLabel(action: IntimacyActionView,): string {
  return t(action.nameKey,);
}

/** Localized description of a catalog action. */
export function actionDescription(action: IntimacyActionView,): string {
  return t(action.descriptionKey,);
}

// ── Action catalog ─────────────────────────────────────────

/**
 * Phase-1 action catalog ("kiss, embrace, talk, play, rest" per the
 * umbrella ticket). `requiresConsent` entries route through the
 * confirm-consent phase before dispatch; `minIntimacy` gates the button
 * until the pair's score reaches it.
 */
export const INTIMACY_ACTION_CATALOG: readonly IntimacyActionView[] = [
  {
    id: "talk",
    nameKey: "nsfw.intimacy.action.talk",
    descriptionKey: "nsfw.intimacy.actionDesc.talk",
    type: "verbal",
    delta: 2,
    minIntimacy: 0,
    requiresConsent: false,
  },
  {
    id: "rest",
    nameKey: "nsfw.intimacy.action.rest",
    descriptionKey: "nsfw.intimacy.actionDesc.rest",
    type: "verbal",
    delta: 1,
    minIntimacy: 0,
    requiresConsent: false,
  },
  {
    id: "gift",
    nameKey: "nsfw.intimacy.action.gift",
    descriptionKey: "nsfw.intimacy.actionDesc.gift",
    type: "gift",
    delta: 3,
    minIntimacy: 10,
    requiresConsent: false,
  },
  {
    id: "kiss",
    nameKey: "nsfw.intimacy.action.kiss",
    descriptionKey: "nsfw.intimacy.actionDesc.kiss",
    type: "physical",
    delta: 4,
    minIntimacy: 20,
    requiresConsent: false,
  },
  {
    id: "embrace",
    nameKey: "nsfw.intimacy.action.embrace",
    descriptionKey: "nsfw.intimacy.actionDesc.embrace",
    type: "physical",
    delta: 6,
    minIntimacy: 30,
    requiresConsent: false,
  },
  {
    id: "play",
    nameKey: "nsfw.intimacy.action.play",
    descriptionKey: "nsfw.intimacy.actionDesc.play",
    type: "intimate",
    delta: 8,
    minIntimacy: 40,
    requiresConsent: true,
  },
];

/** Look up a catalog action by id.
 * @param id - catalog action id
 * @returns {IntimacyActionView | null} the action, or null when unknown
 */
export function findCatalogAction(id: string,): IntimacyActionView | null {
  return INTIMACY_ACTION_CATALOG.find((action,) => action.id === id) ?? null;
}
