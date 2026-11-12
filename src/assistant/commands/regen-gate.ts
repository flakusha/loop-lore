// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Smart-regen decision gate (FEAT-smart-regen-decision-gate-in-main-pipeline).
 *
 * A pure decision step for `/regen`: when the user does not name an explicit
 * action, a typed heuristic picks between a plain re-roll, an alternate
 * regeneration style (the smart-regen transforms vocabulary), and the guided
 * command menu — instead of a blind re-roll. The module is side-effect free
 * (typed inputs in, discriminated-union decision out); the command handler is
 * the only place with behavior.
 *
 * Gate off (the default) reproduces the legacy behavior exactly: explicit
 * actions dispatch, everything else lands on the usage menu.
 */

import type { RegenStyle, } from "../../generation/smart-regen";

/** A target at least this long reads as bloated — the gate suggests condensing. */
const REGEN_CONDENSE_THRESHOLD_CHARS = 1200;

/** A target at most this long reads as thin — the gate suggests expanding. */
const REGEN_EXPAND_THRESHOLD_CHARS = 200;

/** Typed inputs for the decision gate. */
export interface RegenGateInput {
  /** Action id the user explicitly typed (`/regen <action>`), if any. */
  explicitAction: string | undefined;
  /** Declared action ids — the only targets the explicit route accepts. */
  knownActions: readonly string[];
  /** Size signal of the regeneration target; undefined when there is none. */
  target: { length: number } | undefined;
  /** Whether the heuristic gate is enabled (`assistant.smartRegenGate`). */
  gateEnabled: boolean;
}

/** What `/regen` should do instead of a blind re-roll. */
export type RegenGateDecision =
  | { decision: "action"; action: string }
  | { decision: "reroll" }
  | { decision: "style"; style: NonNullable<RegenStyle> }
  | { decision: "menu" };

/**
 * Decide the `/regen` route. An explicit, recognized action always wins.
 * With the gate off — or nothing to measure — everything else lands on the
 * menu (the legacy usage notice). With the gate on, an unqualified regen of
 * a long target suggests a condensing style, of a short one an expanding
 * style, and of a mid-sized one a plain re-roll.
 * @param input - Typed decision inputs
 * @returns the decision; the caller owns every effect
 */
export function decideRegenRoute(input: RegenGateInput,): RegenGateDecision {
  if (input.explicitAction !== undefined) {
    return input.knownActions.includes(input.explicitAction,)
      ? { decision: "action", action: input.explicitAction, }
      // A typed-but-unknown action is a user error: keep the guided menu so
      // the typo is visible even with the gate on.
      : { decision: "menu", };
  }

  if (!input.gateEnabled || input.target === undefined) {
    return { decision: "menu", };
  }

  if (input.target.length >= REGEN_CONDENSE_THRESHOLD_CHARS) {
    return { decision: "style", style: "shorter", };
  }

  if (input.target.length <= REGEN_EXPAND_THRESHOLD_CHARS) {
    return { decision: "style", style: "longer", };
  }

  return { decision: "reroll", };
}
