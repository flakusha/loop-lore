// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW intimacy interface — Alpine state mixin (EPIC-NSFW-UI Phase 1).
 *
 * Owns the {@link IntimacyFlowState} and mounts `renderIntimacyPanel` into
 * the `x-ref="intimacyPanel"` slot of `src/components/chat/intimacy-panel.html`
 * (same mechanism as the body-state widget). Loaders never reject and every
 * async hop carries the stale-chat guard (`state.ts:109` precedent). Pair
 * scores come from the read-only panel's rows (`_nsfwIntimacy`) — no extra
 * fetch; the pair read endpoint INSERTS a zero-score row on read.
 */

import { applyIntimacyAction, grantIntimacyConsent, } from "../../nsfw/intimacy-api";
import { renderIntimacyPanel, } from "../../nsfw/intimacy-interface";
import { reduceIntimacyFlow, } from "../../nsfw/intimacy-scene";
import {
  findCatalogAction,
  initialFlowState,
  INTIMACY_ACTION_CATALOG,
  type IntimacyActionView,
  type IntimacyFlowState,
  type IntimacyPartnerOption,
} from "../../nsfw/intimacy-types";
import { log as rootLog, } from "../logger";
import { resolveCharacterId, } from "../nsfw-panel/state";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "nsfw-intimacy", },);

/** A chat participant row as stored on the chat state. */
interface ParticipantRow {
  /** Actor id of the participant. */
  actor_id: string;
  /** Resolved display name (populated by the chat loader). */
  display_name: string;
}

/** ChatState already carries `currentCharacter`; the intimacy mixin adds the rest. */

/** */
export const intimacyState: Partial<ChatState> & ThisType<ChatState> = {
  _intimacyFlow: initialFlowState(),
  _intimacyPartners: [] as IntimacyPartnerOption[],

  /**
   * Open the flow: build partner options from the chat's participants
   * (excluding the character itself) and enter partner selection.
   * @returns {void}
   */
  openIntimacy() {
    const characterId = this.currentCharacter?.id ?? null;
    const rows = (this._participants ?? []) as ParticipantRow[];
    const partners: IntimacyPartnerOption[] = rows
      .filter((row,) => row.actor_id !== characterId)
      .map((row,) => ({ actorId: row.actor_id, displayName: row.display_name, }));

    this._intimacyPartners = partners;
    this._intimacyFlow = reduceIntimacyFlow(this._intimacyFlow, { type: "open", partners, },);
    this.mountIntimacyPanel();
  },

  /**
   * Pick a partner and enter action selection.
   * @param actorId - the chosen partner's actor id
   * @returns {void}
   */
  selectPartner(actorId: string,) {
    const partner = this._intimacyPartners.find((p,) => p.actorId === actorId);
    if (!partner) { return; }
    this._intimacyFlow = reduceIntimacyFlow(this._intimacyFlow, { type: "selectPartner", partner, },);
    this.mountIntimacyPanel();
  },

  /**
   * Pick an action; consent-gated actions route through the confirm phase.
   * @param actionId - the chosen catalog action id
   * @returns {void}
   */
  selectAction(actionId: string,) {
    const action = findCatalogAction(actionId,);
    if (!action) { return; }
    this._intimacyFlow = reduceIntimacyFlow(this._intimacyFlow, { type: "selectAction", action, },);
    this.mountIntimacyPanel();
    // Consent-gated actions wait for the user's confirm; free actions dispatch
    // right away (the reducer only parks in `applying` for non-consent ones).
    if (!action.requiresConsent && this._intimacyFlow.phase === "applying") {
      void this.dispatchIntimacy();
    }
  },

  /** Confirm the consent dialog: persist the chat consent grant, then dispatch.
   * A refused grant parks the flow in the classified error phase; only a
   * persisted grant advances the reducer, so the gate never sees an
   * ungranted confirm.
   * @returns {Promise<void>}
   */
  async confirmConsent() {
    const chatId = this.activeChat;
    if (!chatId || this._intimacyFlow.phase !== "confirmConsent") { return; }

    const grant = await grantIntimacyConsent(chatId,);
    if (this.activeChat !== chatId) { return; }
    if (grant.status !== "ok") {
      this._intimacyFlow = { ...this._intimacyFlow, phase: "error", error: grant.error, };
      this.mountIntimacyPanel();
      return;
    }

    this._intimacyFlow = reduceIntimacyFlow(this._intimacyFlow, { type: "confirmConsent", },);
    await this.dispatchIntimacy();
  },

  /** Cancel the consent dialog and return to action selection.
   * @returns {void}
   */
  cancelConsent() {
    this._intimacyFlow = reduceIntimacyFlow(this._intimacyFlow, { type: "cancelConsent", },);
    this.mountIntimacyPanel();
  },

  /** Go back one step (consent → actions, actions → partners).
   * @returns {void}
   */
  backIntimacy() {
    this._intimacyFlow = reduceIntimacyFlow(this._intimacyFlow, { type: "back", },);
    this.mountIntimacyPanel();
  },

  /** Leave the effects screen: refresh pairs, then re-enter action selection.
   * @returns {Promise<void>}
   */
  async continueIntimacy() {
    this._intimacyFlow = reduceIntimacyFlow(this._intimacyFlow, { type: "continue", },);
    await (this as unknown as { loadNsfwPanel?: () => Promise<void> }).loadNsfwPanel?.();
    this.mountIntimacyPanel();
  },

  /** Close the flow entirely (reset to idle).
   * @returns {void}
   */
  closeIntimacy() {
    this._intimacyFlow = reduceIntimacyFlow(this._intimacyFlow, { type: "close", },);
    this.mountIntimacyPanel();
  },

  /**
   * Dispatch the pending action to the backend and transition on the result.
   * Never rejects; failures land in the classified error phase.
   * @returns {Promise<void>}
   */
  async dispatchIntimacy() {
    const { partner, action, } = this._intimacyFlow;
    const chatId = this.activeChat;
    if (!partner || !action || !chatId) {
      this._intimacyFlow = reduceIntimacyFlow(this._intimacyFlow, { type: "failed", error: { kind: "network", }, },);
      this.mountIntimacyPanel();
      return;
    }

    this._intimacyFlow = { ...this._intimacyFlow, phase: "applying", };
    this.mountIntimacyPanel();

    try {
      const actorId = await resolveCharacterId(chatId,);
      if (this.activeChat !== chatId) { return; }
      if (!actorId) {
        this._intimacyFlow = reduceIntimacyFlow(this._intimacyFlow, { type: "failed", error: { kind: "target", }, },);
        this.mountIntimacyPanel();
        return;
      }

      const result = await applyIntimacyAction({ chatId, actorId, targetActorId: partner.actorId, action, },);
      if (this.activeChat !== chatId) { return; }

      this._intimacyFlow = result.status === "ok"
        ? reduceIntimacyFlow(this._intimacyFlow, { type: "applied", outcome: result.outcome, },)
        : reduceIntimacyFlow(this._intimacyFlow, { type: "failed", error: result.error, },);

      this.mountIntimacyPanel();
    } catch (error) {
      if (this.activeChat !== chatId) { return; }
      log.error("Failed to apply intimacy action", error instanceof Error ? error : undefined, {},);
      this._intimacyFlow = reduceIntimacyFlow(this._intimacyFlow, { type: "failed", error: { kind: "network", }, },);
      this.mountIntimacyPanel();
    }
  },

  /** Retry the failed action (consent granted, transient failure, etc.).
   * @returns {void}
   */
  retryIntimacy() {
    if (this._intimacyFlow.phase !== "error") { return; }
    this._intimacyFlow = { ...this._intimacyFlow, phase: "applying", error: null, };
    void this.dispatchIntimacy();
  },

  /**
   * Render the current flow into the `x-ref="intimacyPanel"` slot.
   * A missing slot is a no-op (body-state precedent).
   * @returns {void}
   */
  mountIntimacyPanel() {
    const slot = this.$refs?.intimacyPanel as HTMLElement | undefined;
    if (!slot) { return; }
    slot.replaceChildren();

    const partner = this._intimacyFlow.partner;
    const pairScore = partner
      ? (this._nsfwIntimacy ?? []).find((pair,) => pair.targetActorId === partner.actorId)?.score ?? 0
      : 0;

    slot.append(renderIntimacyPanel(this._intimacyFlow, {
      partners: this._intimacyPartners,
      pairScore,
      handlers: {
        onOpen: () => this.openIntimacy(),
        onPartner: (actorId,) => this.selectPartner(actorId,),
        onAction: (actionId,) => this.selectAction(actionId,),
        onConfirm: () => this.confirmConsent(),
        onCancel: () => this.cancelConsent(),
        onContinue: () => void this.continueIntimacy(),
        onRetry: () => this.retryIntimacy(),
        onBack: () => this.backIntimacy(),
        onClose: () => this.closeIntimacy(),
      },
    },),);
  },
};

/** Re-export so the umbrella ticket's "alpine nsfw logic" entry point exists. */
export { INTIMACY_ACTION_CATALOG, };
export type { IntimacyActionView, IntimacyFlowState, };
