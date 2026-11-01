// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Enum-lattice narrowing primitives for the precedence merge
 * (`resolve.ts`): ordered-list comparison, security-ladder rank maps, and
 * provenance rank. `undeclared` carries no information, so any declared
 * value narrows it; two declared values compare by restriction rank.
 *
 * @module project-metadata/lattices
 */
import type {
  PluginOrigin,
  SecurityNetwork,
  SecuritySecrets,
  SecuritySubprocess,
} from "./constants";

/** Narrowest of two ordered values by index in an ascending list. */
export function narrowOrdered<T extends string,>(ascending: readonly T[], a: T, b: T,): T {
  return ascending.indexOf(a,) <= ascending.indexOf(b,) ? a : b;
}

/** Restriction rank; -1 = undeclared (no information, dominated by anything declared). */
const NETWORK_RANK: Record<SecurityNetwork, number> = { undeclared: -1, none: 0, egress: 1, full: 2, };
const SECRETS_RANK: Record<SecuritySecrets, number> = {
  undeclared: -1,
  none: 0,
  "references-only": 1,
  "files-present": 2,
};

const SUBPROCESS_RANK: Record<SecuritySubprocess, number> = {
  undeclared: -1,
  none: 0,
  "toolchain-only": 1,
  arbitrary: 2,
};

/** Narrowest of two declared ladder values by rank. */
function narrowByRank<T extends string,>(ranks: Record<T, number>, a: T, b: T,): T {
  return ranks[a] <= ranks[b] ? a : b;
}

/** Narrowest network posture (none < egress < full). */
export function narrowNetwork(a: SecurityNetwork, b: SecurityNetwork,): SecurityNetwork {
  if (a === "undeclared") { return b; }
  if (b === "undeclared") { return a; }
  return narrowByRank(NETWORK_RANK, a, b,);
}

/** Narrowest secrets posture (none < references-only < files-present). */
export function narrowSecrets(a: SecuritySecrets, b: SecuritySecrets,): SecuritySecrets {
  if (a === "undeclared") { return b; }
  if (b === "undeclared") { return a; }
  return narrowByRank(SECRETS_RANK, a, b,);
}

/** Narrowest subprocess posture (none < toolchain-only < arbitrary). */
export function narrowSubprocess(a: SecuritySubprocess, b: SecuritySubprocess,): SecuritySubprocess {
  if (a === "undeclared") { return b; }
  if (b === "undeclared") { return a; }
  return narrowByRank(SUBPROCESS_RANK, a, b,);
}

/** Provenance tightness rank (core = tightest ceiling). */
const ORIGIN_RANK: Record<PluginOrigin, number> = { core: 0, community: 1, local: 2, };

/** Tightest provenance ceiling of two (core = tightest). */
export function narrowOriginCeiling(a: PluginOrigin, b: PluginOrigin,): PluginOrigin {
  return narrowByRank(ORIGIN_RANK, a, b,);
}
