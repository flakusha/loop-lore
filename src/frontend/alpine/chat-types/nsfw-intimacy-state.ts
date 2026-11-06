// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { IntimacyFlowState, IntimacyPartnerOption, } from "../../nsfw/intimacy-types";

// ── NSFW Intimacy Flow ─────────────────────────────────────

/**
 * Active intimacy interaction flow (EPIC-NSFW-UI Phase 1). The mixin in
 * `alpine/nsfw-intimacy/state.ts` owns the flow state and mounts the panel
 * into the chat's `x-ref="intimacyPanel"` slot.
 */
export interface ChatNsfwIntimacyState {
  /** Current flow (phase machine owned by `intimacy-scene.ts`). */
  _intimacyFlow: IntimacyFlowState;
  /** Partner options for the current open flow (participants minus character). */
  _intimacyPartners: IntimacyPartnerOption[];
  /** Build partner options and enter partner selection. */
  openIntimacy(): void;
  /** Pick a partner and enter action selection. */
  selectPartner(actorId: string,): void;
  /** Pick an action; consent-gated ones route through the confirm phase. */
  selectAction(actionId: string,): void;
  /** Confirm the consent dialog: persist the chat grant, then dispatch.
   * @returns {Promise<void>} resolves after the grant POST settles
   */
  confirmConsent(): Promise<void>;
  /** Cancel the consent dialog and return to action selection. */
  cancelConsent(): void;
  /** Leave the effects screen: refresh pairs, then re-enter action selection. */
  continueIntimacy(): Promise<void>;
  /** Go back one step (consent → actions, actions → partners). */
  backIntimacy(): void;
  /** Close the flow entirely (reset to idle). */
  closeIntimacy(): void;
  /** Dispatch the pending action to the backend; never rejects. */
  dispatchIntimacy(): Promise<void>;
  /** Retry the failed action (consent granted, transient failure). */
  retryIntimacy(): void;
  /** Mount the panel DOM into the chat's intimacy slot. */
  mountIntimacyPanel(): void;
}
