// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * permission-outcome.ts — the wire boundary for ACP permission answers.
 *
 * The answer to `session/request_permission` is `RequestPermissionResponse`
 * (vendored ACP v1 schema, `RequestPermissionResponse`): an object whose
 * REQUIRED `outcome` property carries the `RequestPermissionOutcome`, and
 * that outcome is EXACTLY one of two variants (vendored schema,
 * `RequestPermissionOutcome`):
 * - `{ outcome: "selected", optionId }` — the user picked one of the
 *   ADVERTISED options; `optionId` is REQUIRED and is the id the harness
 *   advertised.
 * - `{ outcome: "cancelled" }` — the prompt turn was cancelled.
 *
 * The verb vocabulary (`allow_once` | `allow_always` | `reject_once` |
 * `reject_always`) is NOT an outcome: it is the spec's `PermissionOptionKind`
 * — the kind of an ADVERTISED option. It decides WHICH option the answer
 * selects and never appears in the answer itself.
 *
 * The protocol's option kinds are snake_case, but some harnesses speak a
 * hyphenated dialect (`allow-once` — Cursor CLI). The internal union stays
 * spec-shaped; only the advertised kind is normalised.
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

/**
 * The spec's answer to a permission request (vendored ACP v1 schema,
 * `RequestPermissionOutcome`) — the ONLY two shapes the protocol allows.
 */
export type WirePermissionOutcome =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

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
 * selects that option. Only an option of the SAME polarity may carry the
 * decision (a denial never rides an allow option), and only a kind the
 * decision may ride (a one-shot allow never rides an "always" option). The
 * answer carries the selected option's ID, never the option's kind — the spec
 * has no field for the kind.
 *
 * A decision NO advertised option can carry is refused SPEC-LEGALLY: the
 * harness's own rejection option, or — with nothing to select — the
 * protocol's `cancelled` outcome. It is never a JSON-RPC error: the agent
 * must be able to act on the refusal.
 * @param outcome - the decision, in the spec union
 * @param options - the options the harness advertised
 * @returns the spec answer.
 */
export function wirePermissionOutcome(
  outcome: PermissionOutcome,
  options: AdvertisedPermissionOption[],
): WirePermissionOutcome {
  // A cancellation is not an option choice - the protocol answers it as itself.
  if (outcome.outcome === "cancelled") {
    return { outcome: "cancelled", };
  }

  const allow = outcome.outcome in ALLOW_VERBS;

  // Only an option of the SAME polarity may carry the decision: a denial
  // never rides an allow option, and an allow never rides a reject one.
  const samePolarity = options.filter((option,) =>
    option.outcome !== null && (option.outcome in ALLOW_VERBS) === allow
  );

  const chosen = namedOption(samePolarity, outcome,) ??
    ridableOption(samePolarity, outcome.outcome,);

  if (chosen) {
    return { outcome: "selected", optionId: chosen.optionId, };
  }

  // Fail closed, but spec-legally: the refusal rides the harness's own
  // rejection option; with no option left to select, the protocol's other
  // outcome - `cancelled` - is the only shape that carries a refusal.
  const refusal = ridableOption(rejectOptions(options,), "reject_once",);
  if (refusal) {
    return { outcome: "selected", optionId: refusal.optionId, };
  }

  return { outcome: "cancelled", };
}

/**
 * The option the decision NAMES, when that option may carry it. An explicit
 * option id never bypasses the ridability ladder: an "always" option cannot
 * carry a one-shot decision.
 * @param options - the same-polarity options the harness advertised
 * @param outcome - the decision, in the spec union
 * @returns the named option, or undefined when it may not carry the decision.
 */
function namedOption(
  options: AdvertisedPermissionOption[],
  outcome: PermissionOutcome,
): AdvertisedPermissionOption | undefined {
  const ladder = RIDABLE_KINDS[outcome.outcome];
  if (!outcome.optionId || !ladder) { return undefined; }

  return options.find((option,) =>
    option.optionId === outcome.optionId && option.outcome !== null && ladder.includes(option.outcome,)
  );
}

/**
 * The advertised options that REFUSE the tool call.
 * @param options - the options the harness advertised
 * @returns the rejection-polarity options.
 */
function rejectOptions(options: AdvertisedPermissionOption[],): AdvertisedPermissionOption[] {
  return options.filter((option,) => option.outcome !== null && !(option.outcome in ALLOW_VERBS));
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
