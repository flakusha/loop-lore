// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * PrincipalKind — the closed vocabulary of server-resolved principal
 * identities (epic-principal-scoped-credentials trust boundary).
 *
 * A principal is NEVER caller-supplied: tool params, chat context, and
 * request bodies cannot assert one. A kind is minted ONLY here, from
 * verified credential evidence at the auth seam (`authenticateRequest`):
 *  - JWT session + actors row with `actor_type: "system"` → internal-service
 *    (audit rows FK cleanly to the actors table);
 *  - JWT session with any other actors evidence → user;
 *  - integration token (`llri_` bearer resolved from `integration_tokens`)
 *    → external-agent.
 * `user-worktree` is in the vocabulary for the worktree-scoped user sessions
 * the project-spaces epic will bind — no credential path mints it yet, and
 * nothing outside the server may assert it.
 *
 * The branded form means a raw string (a body field, a DB meta blob, a
 * header) can never flow into a principal-shaped field: it must pass
 * {@link toPrincipalKind}, which fails closed to null on anything outside
 * the vocabulary — there is no default kind to fall back to. (Fail-closed
 * narrow precedent: `toFacadeScope`, integrations/loop-lore-facade/types.ts.)
 */
import type { Brand, } from "../utils/brands";

/** The epic's closed kind set — the ONLY values a principal may carry. */
export const PRINCIPAL_KINDS = [
  "user",
  "user-worktree",
  "internal-service",
  "external-agent",
] as const;

/** The literal form source code writes (compile-time-checked). */
export type PrincipalKindLiteral = (typeof PRINCIPAL_KINDS)[number];

/**
 * The branded principal kind: construction runs through {@link principalKind}
 * / {@link toPrincipalKind} / {@link principalKindForActor} only, so every
 * value in circulation was checked against the closed set where it was born.
 */
export type PrincipalKind = Brand<PrincipalKindLiteral, "PrincipalKind">;

/**
 * Mint a principal kind from a compile-time-checked literal.
 * @param kind - one of the {@link PRINCIPAL_KINDS} literals
 * @returns the branded kind
 */
export function principalKind(kind: PrincipalKindLiteral,): PrincipalKind {
  return kind as PrincipalKind;
}

/**
 * Fail-closed narrow of an UNTRUSTED kind-shaped string into the vocabulary.
 * Anything outside {@link PRINCIPAL_KINDS} — unknown, misspelled, wrong
 * casing ("agent", "operator", "Admin", "") — narrows to null; never a
 * guessed kind.
 * @param raw - a string claiming to be a principal kind
 * @returns the branded kind, or null when the claim is not in the vocabulary
 */
export function toPrincipalKind(raw: string,): PrincipalKind | null {
  return (PRINCIPAL_KINDS as readonly string[]).includes(raw,)
    ? principalKind(raw as PrincipalKindLiteral,)
    : null;
}

/**
 * The server-side actors-row mapping — the ONE place a JWT session's actor
 * evidence becomes a kind. An actors row with `actor_type: "system"` is the
 * internal-service principal; every other actors evidence ("user",
 * "character", "narrator" — or no row at all) is a plain user principal.
 * Total over the evidence space: absence of system-actor evidence resolves
 * the user kind; no credential is ever defaulted to a kind it did not earn.
 * @param actorType - the `actors.actor_type` of the row matching the
 * session's subject, when a row exists
 * @returns the principal kind the actor evidence earns
 */
export function principalKindForActor(
  actorType: string | null | undefined,
): PrincipalKind {
  return actorType === "system"
    ? principalKind("internal-service",)
    : principalKind("user",);
}
