// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * permission-outcome.ts — the wire boundary for ACP permission outcomes.
 *
 * The protocol's outcome vocabulary is snake_case (`allow_once`, ...), but
 * some harnesses speak a hyphenated dialect (`allow-once` — Cursor CLI). The
 * internal union stays spec-shaped; only the wire may carry a harness's own
 * spelling. This module normalises a wire spelling into the union and maps a
 * decision onto the option the harness advertised, so the answer comes back
 * in the vocabulary that harness understands.
 *
 * Pure: no IO, no clock, no framework.
 */

import { type PermissionOutcome, } from "./adapter-types";

/** The spec-shaped outcome verbs (the internal union's members). */
const OUTCOME_VERBS: readonly PermissionOutcome["outcome"][] = [
  "allow_once",
  "allow_always",
  "reject_once",
  "reject_always",
  "cancelled",
];

/** The verbs that grant the tool call; every other verb refuses it. */
const ALLOW_VERBS: Record<string, true> = { allow_once: true, allow_always: true, };

/**
 * Normalise a wire outcome spelling into the spec-shaped union.
 * @param value - the harness's own spelling (`allow-once`, `Allow Once`, ...)
 * @returns the union member, or null when the spelling is unknown.
 */
export function normalizePermissionOutcome(value: string,): PermissionOutcome["outcome"] | null {
  const key = value.trim().toLowerCase().split("-",).join("_",);
  return OUTCOME_VERBS.find((verb,) => verb === key) ?? null;
}

/** The outcome as it goes on the wire — the harness's own spelling. */
export interface WirePermissionOutcome {
  /** The outcome verb, in the harness's own spelling. */
  outcome: string;
  /** The chosen option id, when the harness's options carry ids. */
  optionId?: string;
}

/** One permission option the harness advertised. */
export interface AdvertisedPermissionOption {
  /** Option id the harness gave. */
  optionId: string;
  /** The harness's own spelling of the option kind (verbatim wire value). */
  kind: string;
  /** The kind normalised into the spec union; null when unknown. */
  outcome: PermissionOutcome["outcome"] | null;
}

/**
 * Narrow the options a `session/request_permission` payload advertised.
 * @param params - the raw request params
 * @returns the advertised options; empty when the payload carried none.
 */
export function advertisedPermissionOptions(params: unknown,): AdvertisedPermissionOption[] {
  const options = (params as { options?: unknown } | null)?.options;
  if (!Array.isArray(options,)) { return []; }

  const parsed: AdvertisedPermissionOption[] = [];
  for (const option of options) {
    const entry = option as { optionId?: unknown; kind?: unknown } | null;
    const optionId = typeof entry?.optionId === "string" ? entry.optionId : null;
    const kind = typeof entry?.kind === "string" ? entry.kind : null;
    if (!optionId || !kind) { continue; }
    parsed.push({ optionId, kind, outcome: normalizePermissionOutcome(kind,), },);
  }

  return parsed;
}

/**
 * Map a decision onto the option the harness advertised, so the answer
 * carries that harness's own spelling. An allow the harness advertised no
 * option for is never sent — it fails closed as a denial.
 * @param outcome - the decision, in the spec union
 * @param options - the options the harness advertised
 * @returns the outcome to put on the wire.
 */
export function wirePermissionOutcome(
  outcome: PermissionOutcome,
  options: AdvertisedPermissionOption[],
): WirePermissionOutcome {
  // A cancellation is not an option choice - the protocol answers it as itself.
  if (outcome.outcome === "cancelled") { return outcome; }
  if (options.length === 0) { return outcome; }

  const allow = outcome.outcome in ALLOW_VERBS;
  // Only an option of the SAME polarity may carry the decision: a denial
  // never rides an allow option, and an allow never rides a reject one.
  const samePolarity = options.filter((option,) =>
    option.outcome !== null && (option.outcome in ALLOW_VERBS) === allow
  );

  const chosen = samePolarity.find((option,) => option.optionId === outcome.optionId) ??
    samePolarity.find((option,) => option.outcome === outcome.outcome);

  if (chosen) { return { outcome: chosen.kind, optionId: chosen.optionId, }; }

  // Nothing the harness advertised can carry this decision - fail closed.
  return allow ? denial(options,) : outcome;
}

/**
 * The denial to send when an allow cannot be carried: the harness's own reject
 * spelling when it advertised one, else the spec verb.
 * @param options - the options the harness advertised
 * @returns the denial to put on the wire.
 */
function denial(options: AdvertisedPermissionOption[],): WirePermissionOutcome {
  const rejection = options.find((option,) => option.outcome === "reject_once") ??
    options.find((option,) => option.outcome === "reject_always");

  if (rejection) { return { outcome: rejection.kind, optionId: rejection.optionId, }; }

  return { outcome: "reject_once", };
}
