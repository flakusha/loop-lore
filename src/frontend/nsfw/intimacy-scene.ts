// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW intimacy interface — pure flow controller (plan §4 state machine).
 *
 * `reduceIntimacyFlow` is the single transition function: the Alpine mixin
 * feeds it events and renders whatever phase comes back. Progression per
 * the ticket trim is "repeat the flow with refreshed pair state" — the
 * `continue` event returns to `actionSelect` and the mixin reloads pairs.
 * Positioning is client-side staging (`positionSelect` between partner and
 * action): the selection rides the apply wire `context` field
 * (`positionContext`), which the backend persists verbatim into
 * `action_history[].context` — no new backend contract.
 */

import type {
  IntimacyActionView,
  IntimacyFlowEvent,
  IntimacyFlowState,
} from "./intimacy-types";
import { initialFlowState, } from "./intimacy-types";

/**
 * Whether an action's button is locked for the pair's current score.
 * @param action - catalog action
 * @param score - current pair score
 * @returns {boolean} true when the pair score is below the action's minimum
 */
export function actionLocked(action: IntimacyActionView, score: number,): boolean {
  return score < action.minIntimacy;
}

/**
 * Apply one flow event, guarding every transition on the current phase.
 * Unexpected events are no-ops (the state machine never jumps tracks).
 * @param state - current flow state
 * @param event - event from the UI
 * @returns {IntimacyFlowState} the next state (pure — input is never mutated)
 */
export function reduceIntimacyFlow(state: IntimacyFlowState, event: IntimacyFlowEvent,): IntimacyFlowState {
  switch (event.type) {
    case "open":
      return { ...initialFlowState(), phase: "partnerSelect", };

    case "selectPartner": {
      if (state.phase !== "partnerSelect") { return state; }
      return {
        ...state,
        phase: "positionSelect",
        partner: event.partner,
        position: null,
        action: null,
        outcome: null,
        error: null,
      };
    }

    case "selectPosition": {
      if (state.phase !== "positionSelect" || !state.partner) { return state; }
      return { ...state, phase: "actionSelect", position: event.position, };
    }

    case "selectAction": {
      if (state.phase !== "actionSelect" || !state.partner) { return state; }
      return event.action.requiresConsent
        ? { ...state, phase: "confirmConsent", action: event.action, }
        : { ...state, phase: "applying", action: event.action, outcome: null, error: null, };
    }

    case "confirmConsent": {
      if (state.phase !== "confirmConsent") { return state; }
      return { ...state, phase: "applying", };
    }

    case "cancelConsent": {
      if (state.phase !== "confirmConsent") { return state; }
      return { ...state, phase: "actionSelect", action: null, };
    }

    case "applied": {
      if (state.phase !== "applying") { return state; }
      return { ...state, phase: "effects", outcome: event.outcome, };
    }

    case "failed": {
      if (state.phase !== "applying") { return state; }
      return { ...state, phase: "error", error: event.error, };
    }

    case "back": {
      if (state.phase === "confirmConsent") { return { ...state, phase: "actionSelect", action: null, }; }
      if (state.phase === "actionSelect") {
        return {
          ...state,
          phase: "positionSelect",
          position: null,
          action: null,
        };
      }

      if (state.phase === "positionSelect") {
        return { ...state, phase: "partnerSelect", partner: null, position: null, };
      }

      return state;
    }

    case "continue": {
      // Progression trim: re-enter action selection; the mixin refreshes the
      // pair rows so the score meter and locks reflect the applied action.
      if (state.phase !== "effects") { return state; }
      return { ...state, phase: "actionSelect", action: null, outcome: null, };
    }

    case "close":
      return initialFlowState();
  }
}
