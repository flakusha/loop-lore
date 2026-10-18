// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Federation peer-registry enums (TASK-federation-peer-registry-workload-columns).
 *
 * - `PeerWorkloadClass`: the closed set of workload classes an instance can
 *   accept. Advertised on the wire as `capabilities`.
 * - `PeerInstanceKind`: operator-facing label for what a peer is for.
 * - `PeerAuthMode`: how a peer authenticates the workload wire.
 * - `PeerLinkKind`: DERIVED from the peer origin host, never stored.
 */

export const PeerWorkloadClass = {
  Chat: "chat",
  Image: "image",
  Aux: "aux",
  Tts: "tts",
  Translation: "translation",
  Embedding: "embedding",
  Vision: "vision",
} as const;
export type PeerWorkloadClass = (typeof PeerWorkloadClass)[keyof typeof PeerWorkloadClass];

/** Stable iteration order for the advertisement and tests. */
export const PEER_WORKLOAD_CLASSES: readonly PeerWorkloadClass[] = Object.values(PeerWorkloadClass,);

export const PeerInstanceKind = {
  Business: "business",
  Rpg: "rpg",
  Assistant: "assistant",
  DedicatedGpu: "dedicated-gpu",
  General: "general",
} as const;
export type PeerInstanceKind = (typeof PeerInstanceKind)[keyof typeof PeerInstanceKind];

export const PEER_INSTANCE_KINDS: readonly PeerInstanceKind[] = Object.values(PeerInstanceKind,);

export const PeerAuthMode = {
  /** Default. CA/SPKI trust from `FederationPeerTrustConfig`. */
  Tls: "tls",
  /** Same-host peer: no public cert, shared workload token instead. */
  HostLocal: "host-local",
} as const;
export type PeerAuthMode = (typeof PeerAuthMode)[keyof typeof PeerAuthMode];

export const PEER_AUTH_MODES: readonly PeerAuthMode[] = Object.values(PeerAuthMode,);

/**
 * Derived link kind. `loopback` covers `127.0.0.1`, `::1`, `localhost` and
 * `*.localhost`; everything else is `remote`. Never persisted — a stored copy
 * could drift from the origin.
 */
export const PeerLinkKind = {
  Loopback: "loopback",
  Remote: "remote",
} as const;
export type PeerLinkKind = (typeof PeerLinkKind)[keyof typeof PeerLinkKind];

/**
 * Whether a performance budget is counted or enforced.
 * `Advisory` is the default for a newly added peer: count and report, never
 * refuse. `Hard` enforces at the inbound peer-work endpoint.
 */
export const PeerBudgetMode = {
  Advisory: "advisory",
  Hard: "hard",
} as const;
export type PeerBudgetMode = (typeof PeerBudgetMode)[keyof typeof PeerBudgetMode];

/** Stable iteration order for validation and the admin surface. */
export const PEER_BUDGET_MODES: readonly PeerBudgetMode[] = Object.values(PeerBudgetMode,);
