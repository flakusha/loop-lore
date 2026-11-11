// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * repo-access/grants.ts — capability grants for the RSI repo-access tier
 * (epic-harness-rsi-repo-access, "Capability grants" + amendment A2/A4).
 *
 * `internal-service` holds its capabilities as GRANTS — there is no
 * escalation flow for it and no auto-approve. Defaults per principal kind
 * (epic-verbatim):
 *  - `internal-service`: ALL capabilities;
 *  - `user` / `user-worktree`: NONE of repo:* (non-goal: no repo write for
 *    end users);
 *  - `external-agent`: `worktree:spawn` + `check:run` by default (their
 *    worktrees live inside the repo root, so repo READ is structural).
 *
 * Fail-closed composition: an explicit grant list is narrowed through
 * {@link toRepoCapability} and INTERSECTED with the kind's defaults, so a
 * stale/typed-in grant list can never exceed what the principal's kind may
 * hold, and unknown strings are dropped rather than guessed.
 *
 * Spawn-time persistence on `chat_branches` (amendment A4, absorbing
 * TASK-harness-delegated-permission-grants) is a LATER slice — the grant
 * list input shape here is the seam that persistence will feed.
 */
import { type PrincipalKind, } from "../../../middleware/types";
import {
  type RepoCapability,
  toRepoCapability,
} from "./capabilities";

/** Default capability grants per principal kind (epic-verbatim table). */
export const DEFAULT_KIND_GRANTS: Record<PrincipalKind, readonly RepoCapability[]> = {
  "internal-service": [
    "repo:write",
    "worktree:spawn",
    "check:run",
    "commit:signed",
    "finalize:merge",
    "ticket:ops",
  ],
  "user": [],
  "user-worktree": [],
  "external-agent": ["worktree:spawn", "check:run",],
};

/** Inputs for {@link resolveRepoGrants}. */
export interface ResolveRepoGrantsInput {
  /** The principal's server-resolved kind. */
  kind: PrincipalKind;
  /**
   * Explicit grant names (future: the spawn-time grants persisted on the
   * chat branch). Unknown names are dropped; the result never exceeds the
   * kind defaults. Omitted = the kind defaults apply as-is.
   */
  granted?: readonly string[];
}

/**
 * Resolve the capability set one principal kind holds.
 * @param input - the kind plus optional explicit grant names
 * @returns the granted capability set: the kind defaults when no list is
 *   given; otherwise the INTERSECTION of the narrowed grant list with the
 *   kind defaults (an explicit list means exactly those, never more)
 */
export function resolveRepoGrants(input: ResolveRepoGrantsInput,): ReadonlySet<RepoCapability> {
  const kindDefaults = DEFAULT_KIND_GRANTS[input.kind] as readonly RepoCapability[];

  if (input.granted === undefined) {
    return new Set<RepoCapability>(kindDefaults,);
  }

  const allowed = new Set<RepoCapability>(kindDefaults,);
  const grants = new Set<RepoCapability>();
  for (const raw of input.granted) {
    const cap = toRepoCapability(raw,);
    if (cap !== null && allowed.has(cap,)) {
      grants.add(cap,);
    }
  }

  return grants;
}

/**
 * Whether a grant set covers one required capability.
 * @param grants - the resolved grant set
 * @param required - the capability the op demands
 * @returns true when the set holds the capability
 */
export function holdsCapability(grants: ReadonlySet<RepoCapability>, required: RepoCapability,): boolean {
  return grants.has(required,);
}
