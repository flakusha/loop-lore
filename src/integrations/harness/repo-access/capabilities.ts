// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * repo-access/capabilities.ts — the RSI repo-access tier capability
 * vocabulary (epic-harness-rsi-repo-access, "Capability grants").
 *
 * Typed constants module per the research amendment A11, following the
 * `HARNESS_TIERS` runtime-list precedent (config/schema/harness.ts): the
 * runtime list IS the type, so wire/validation/enforcement cannot drift.
 *
 * Vocabulary (epic-verbatim, amendment A7): `repo:read` is deliberately
 * ABSENT — repo read access is implied by worktree access, since agent
 * worktrees live inside the repo root (`tree/`).
 *
 * SECURITY: these names are the unit of dangerous capability in the tier.
 * A grant list never widens what a principal's KIND may hold
 * (grants.ts intersects kind defaults); the gate (gate.ts) refuses every
 * execution unless the tier is operator-enabled AND the required
 * capability is held.
 */

/** The closed capability set — the ONLY values a grant may carry. */
export const HARNESS_REPO_CAPABILITIES = [
  "repo:write",
  "worktree:spawn",
  "check:run",
  "commit:signed",
  "finalize:merge",
  "ticket:ops",
] as const;

/** A capability name, as written in grants/config/audit tags. */
export type RepoCapability = (typeof HARNESS_REPO_CAPABILITIES)[number];

/**
 * Fail-closed narrow of an UNTRUSTED capability-shaped string into the
 * vocabulary. Anything outside {@link HARNESS_REPO_CAPABILITIES} — unknown,
 * misspelled, wrong casing ("repo.write", "REPO:WRITE", the pruned
 * "repo:read"), or empty — narrows to null; never a guessed capability.
 * (Fail-closed narrow precedent: `toFacadeScope`, loop-lore-facade/types.ts.)
 * @param raw - a string claiming to be a repo capability
 * @returns the capability, or null when the claim is not in the vocabulary
 */
export function toRepoCapability(raw: string,): RepoCapability | null {
  return (HARNESS_REPO_CAPABILITIES as readonly string[]).includes(raw,)
    ? (raw as RepoCapability)
    : null;
}
