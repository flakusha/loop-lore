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

/** ACP harness flavors loop-lore ships adapters for (runtime list: wire/validation cannot drift). */
export const HARNESS_FLAVORS = [
  "omp",
  "opencode",
  "codex",
  "claude-code",
  "hermes",
  "openclaw",
  "antigravity",
] as const;

/** Which shipped adapter speaks a profile's wire. */
export type HarnessFlavor = (typeof HARNESS_FLAVORS)[number];

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

/**
 * One MCP server handed to the harness agent via ACP `session/new` (stdio
 * only — the passthrough is verbatim, so an http/sse entry has no wire
 * mapping yet; add one when a profile needs it).
 */
export interface McpServerConfig {
  /** Server name, as the agent sees it. */
  name: string;
  /** Spawn argv head for a stdio server. */
  command: string;
  /** Spawn argv tail. */
  args?: string[];
  /** Environment entries for the spawned server. */
  env?: Array<{ name: string; value: string }>;
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
  /** Selection strategy: only `failover` is implemented. */
  strategy?: "failover";
  /** Which shipped adapter speaks this profile's wire. Default: `"omp"`. */
  harness?: HarnessFlavor;
  /** Optional usage caps (rpm / tokensPerDay). */
  limits?: AcpProfileLimits;
  /** Optional breaker thresholds. */
  health?: AcpProfileHealth;
  /**
   * Sandbox root the profile's permission asks are judged against. Absent =
   * the process cwd (unchanged behaviour). When set it must be an existing
   * directory; a path with `..` traversal is rejected at config load.
   */
  sandboxRoot?: string;
  /**
   * MCP servers the agent connects to (ACP `session/new` `mcpServers`,
   * verbatim). Absent/empty = the agent gets none.
   */
  mcpServers?: McpServerConfig[];
  /**
   * Extra workspace roots handed to the agent (ACP `session/new`
   * `additionalDirectories`). Every entry must be absolute — a relative
   * entry is rejected locally before the request goes out.
   */
  additionalDirectories?: string[];
  /**
   * Default mode id for ACP `session/set_mode` (e.g. omp plan/act). Absent
   * = the adapter sends only an explicitly passed id.
   */
  mode?: string;
  /**
   * Explicit user acknowledgement that driving this profile for RPG/other
   * non-chat functionalities may conflict with the provider's ToS when the
   * profile is subscription-backed. Absent/false by default; records consent
   * and gates subscription-backed flavors at dispatch via the profile selector.
   */
  tosGrayzoneAcknowledged?: boolean;
}

/** `harness.acp` sub-config. */
export interface HarnessAcpConfig {
  /** Master switch; disabled profiles are never probed or selected. */
  enabled: boolean;
  /** Configured profiles, in failover preference order. */
  profiles: AcpProfileConfig[];
}

/**
 * `harness.repoAccess` sub-config: the RSI repo-root access tier
 * (epic-harness-rsi-repo-access).
 *
 * SECURITY BOUNDARY — DANGEROUS CAPABILITY. Enabling this tier lets the
 * server-resolved `internal-service` principal execute repo commands and
 * touch repo-root paths (`src/`, `.plan/`, migrations, workflows) that every
 * other principal is confined away from. It is disabled by default, never
 * auto-enabled, and only the operator turns it on (file config or the admin
 * harness-settings override). Every execution decision is audited to
 * `tool_call_audit`; the gate fails closed on every absent/unknown input.
 */
export interface RepoAccessConfig {
  /**
   * Master switch for the repo-access tier. `false` (the default) denies
   * every repo-access execution regardless of principal or grants.
   */
  enabled: boolean;
}
/** Top-level `harness` section. */
export interface HarnessConfig {
  acp: HarnessAcpConfig;
  /**
   * RSI repo-root access tier. Optional: an absent section means disabled
   * (resolve through the default at the gate — `loadConfig` omits
   * unconfigured sections, so absence must never widen access).
   */
  repoAccess?: RepoAccessConfig;
}
