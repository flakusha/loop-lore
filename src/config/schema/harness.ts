// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/harness.ts — external-harness config types
//
// `harness.acp` enumerates external ACP-speaking harness profiles (omp,
// opencode, ...) loop-lore may drive. Tiers ("good"/"fast") are loop-lore-side
// labels — no harness advertises roles over ACP — so each tier maps to a
// concrete `provider/id` model id that the profile must advertise.

/** The two harness tiers, as a runtime list (wire/validation cannot drift). */
export const HARNESS_TIERS = ["good", "fast",] as const;

/** A harness tier: `good` → planning/design/review, `fast` → mechanical. */
export type HarnessTierId = (typeof HARNESS_TIERS)[number];

/** Capabilities a harness tier is trusted to provide. */
export const HARNESS_CAPABILITIES = ["tools", "thinking",] as const;

/** Capability flag name. */
export type HarnessCapability = (typeof HARNESS_CAPABILITIES)[number];

/** One tier: the concrete model id plus what it is trusted to do. */
export interface AcpTierConfig {
  /**
   * Concrete `provider/id` model id, exactly as the harness advertises it via
   * ACP `session/new` configOptions. Role aliases (`@smol`) are invalid —
   * harnesses never advertise roles over the wire.
   */
  model: string;
  /** Capability flags this tier satisfies. */
  capabilities: HarnessCapability[];
}

/** Optional loop-lore-side usage caps for one profile. Missing = unlimited. */
export interface AcpProfileLimits {
  /** Max prompt dispatches per rolling 60s window. */
  rpm?: number;
  /** Max tokens (in + out) per rolling 24h window. */
  tokensPerDay?: number;
}

/** Optional circuit-breaker thresholds for one profile. */
export interface AcpProfileHealth {
  /** Consecutive failures before the profile's breaker opens (default 3). */
  maxConsecutiveFailures?: number;
  /** How long an open breaker blocks the profile (default 300000 ms). */
  cooldownMs?: number;
}

/** One external harness profile: how to spawn it and what it offers. */
export interface AcpProfileConfig {
  /** loop-lore-local identifier; unique across the profiles list. */
  name: string;
  /**
   * Spawn argv for the ACP server (stdio, newline-delimited JSON-RPC).
   * Credentials/profile selection ride here — loop-lore never reads them.
   */
  command: string[];
  /** Tier → concrete model mapping; at least one tier required. */
  tiers: Partial<Record<HarnessTierId, AcpTierConfig>>;
  /** Selection strategy: only `failover` is implemented in this slice. */
  strategy?: "failover" | "best-of" | "split";
  /** Optional usage caps (rpm / tokensPerDay). */
  limits?: AcpProfileLimits;
  /** Optional breaker thresholds. */
  health?: AcpProfileHealth;
}

/** `harness.acp` sub-config. */
export interface HarnessAcpConfig {
  /** Master switch; disabled profiles are never probed or selected. */
  enabled: boolean;
  /** Configured profiles, in failover preference order. */
  profiles: AcpProfileConfig[];
}

/** Top-level `harness` section. */
export interface HarnessConfig {
  acp: HarnessAcpConfig;
}
