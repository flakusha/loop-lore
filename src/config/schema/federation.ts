// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/federation.ts — Federation/mesh interconnect config types

/** Per-peer trust override consumed by the TLS peer-trust ticket. */
export interface FederationPeerTrustConfig {
  /** PEM CA bundle(s) to trust for this peer (overrides system store). */
  caBundle?: string;
  /** Base64 SPKI pin(s); the peer leaf cert must match one. */
  spkiPins?: string[];
}

/** A configured peer endpoint for federation interconnect. */
export interface FederationPeerConfig {
  /** Peer origin URL (scheme + host[:port]). */
  origin: string;
  /** Optional trust overrides for this peer. */
  trust?: FederationPeerTrustConfig;
}

/** Federation/mesh interconnect config. All opt-in; disabled by default. */
export interface FederationConfig {
  /** Enable federation/mesh interconnect. Default false. */
  enabled: boolean;
  /** Peer origins to bootstrap discovery from. Default empty. */
  seeds: string[];
  /** Per-peer endpoint + trust overrides. Default empty. */
  peers: FederationPeerConfig[];
}
