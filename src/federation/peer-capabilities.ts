// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/peer-capabilities.ts — DECLARED vs OBSERVED workload classes.
//
// Declared: what this instance is configured to accept
// (`config.federation.workloadOffload.classes`) — published as
// `/api/instance-state` `capabilities`.
// Observed: what a peer advertised, normalized into `mesh_peers.capabilities`
// by `touchPeer`. Unknown strings are dropped and logged, never persisted and
// never reflected back out. Routing intersects the two (later slice).

import { type Config, } from "../config/schema";
import { PEER_WORKLOAD_CLASSES, type PeerWorkloadClass, } from "../db/enums";
import { getChildLogger, } from "../logger";

/** Narrow an arbitrary wire value to a member of the closed class enum. */
export function isPeerWorkloadClass(value: unknown,): value is PeerWorkloadClass {
  return typeof value === "string" && (PEER_WORKLOAD_CLASSES as readonly string[]).includes(value,);
}

/**
 * Workload classes this instance declares it accepts, deduplicated in the
 * configured order. An instance with no `workloadOffload` section declares
 * nothing, which keeps the wire shape `[]`.
 * @param config
 * @returns {PeerWorkloadClass[]}
 */
export function declaredWorkloadClasses(config: Config,): PeerWorkloadClass[] {
  const configured = config.federation.workloadOffload?.classes;
  if (!Array.isArray(configured,)) { return []; }
  const seen = new Set<PeerWorkloadClass>();
  for (const entry of configured) {
    if (isPeerWorkloadClass(entry,)) { seen.add(entry,); }
  }

  return [...seen,];
}

/**
 * Normalize an inbound advertisement's `capabilities` into known classes.
 * Non-arrays and unknown members are dropped (with a warning) rather than
 * persisted, so a peer cannot inject arbitrary strings into the registry.
 * @param raw
 * @returns {PeerWorkloadClass[]}
 */
export function parseAdvertisedClasses(raw: unknown,): PeerWorkloadClass[] {
  if (!Array.isArray(raw,)) { return []; }
  const kept: PeerWorkloadClass[] = [];
  for (const entry of raw) {
    if (isPeerWorkloadClass(entry,)) {
      if (!kept.includes(entry,)) { kept.push(entry,); }
      continue;
    }

    getChildLogger("federation/peer-capabilities",)?.warn(
      "peer advertisement carries an unknown workload class — dropped",
      { entry: typeof entry === "string" ? entry : typeof entry, },
    );
  }

  return kept;
}
