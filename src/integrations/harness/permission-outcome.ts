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
 * The kinds a decision may ride, strongest match first. An allow NEVER widens
 * (a one-shot decision never rides an "always" option - that would grant more
 * than was decided); a denial may ride either reject kind. Same polarity only:
 * a denial never rides an allow option, an allow never rides a reject one.
 */
const RIDABLE_KINDS: Record<string, readonly PermissionOutcome["outcome"][]> = {
  allow_always: ["allow_always", "allow_once",],
  allow_once: ["allow_once",],
  reject_always: ["reject_always", "reject_once",],
  reject_once: ["reject_once", "reject_always",],
};

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
 * carries that harness's own spelling. Only an option of the SAME polarity
 * may carry the decision (a denial never rides an allow option). An allow the
 * harness advertised no option for is never sent — it fails closed as a denial.
 *
 * The spec REQUIRES the options on a permission request
 * (https://agentclientprotocol.com/protocol/v1/schema.md,
 * `RequestPermissionRequest.options`), so a harness that advertises none
 * offers nothing to select: an allow cannot be expressed and fails closed.
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

  const allow = outcome.outcome in ALLOW_VERBS;
  // No advertised option can carry the decision: an allow fails closed as a
  // denial, a denial stays a denial.
  if (options.length === 0) { return allow ? { outcome: "reject_once", } : outcome; }

  // Only an option of the SAME polarity may carry the decision: a denial
  // never rides an allow option, and an allow never rides a reject one.
  const samePolarity = options.filter((option,) =>
    option.outcome !== null && (option.outcome in ALLOW_VERBS) === allow
  );

  const chosen = samePolarity.find((option,) => option.optionId === outcome.optionId) ??
    ridableOption(samePolarity, outcome.outcome,);

  if (chosen) { return { outcome: chosen.kind, optionId: chosen.optionId, }; }

  // Nothing the harness advertised can carry this decision - fail closed.
  return denial(options,);
}

/**
 * The option that best carries a decision: the exact kind first, then the
 * nearest same-polarity kind (an "always" decision rides the "once" option).
 * @param options - the same-polarity options the harness advertised
 * @param verb - the decision's spec verb
 * @returns the option to ride, or undefined when none fits.
 */
function ridableOption(
  options: AdvertisedPermissionOption[],
  verb: PermissionOutcome["outcome"],
): AdvertisedPermissionOption | undefined {
  const ladder = RIDABLE_KINDS[verb];
  if (!ladder) { return undefined; }

  for (const kind of ladder) {
    const match = options.find((option,) => option.outcome === kind);
    if (match) { return match; }
  }

  return undefined;
}

/**
 * The denial to send when no advertised option can carry the decision: the
 * harness's own reject spelling when it advertised one, else the spec verb.
 * @param options - the options the harness advertised
 * @returns the denial to put on the wire.
 */
function denial(options: AdvertisedPermissionOption[],): WirePermissionOutcome {
  const rejection = options.find((option,) => option.outcome === "reject_once") ??
    options.find((option,) => option.outcome === "reject_always");

  if (rejection) { return { outcome: rejection.kind, optionId: rejection.optionId, }; }

  return { outcome: "reject_once", };
}
