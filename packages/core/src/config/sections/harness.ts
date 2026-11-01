// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/harness.ts — external-harness config section
//
// Defaults + section class + JSON-schema meta for `harness.acp`, plus the
// semantic validation the JSON schema cannot express (unknown tier keys,
// non-`provider/id` models, duplicate profile names).

import {
  type AcpProfileConfig,
  HARNESS_CAPABILITIES,
  HARNESS_TIERS,
  type HarnessConfig,
  type HarnessTierId,
} from "../schema/harness";

/** Defaults: harness integration is opt-in and empty. */
export const HARNESS_DEFAULTS: HarnessConfig = {
  acp: {
    enabled: false,
    profiles: [],
  },
};

/** Default breaker threshold when a profile omits `health`. */
export const HARNESS_DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

/** Default open-breaker cooldown when a profile omits `health`. */
export const HARNESS_DEFAULT_COOLDOWN_MS = 300_000;

/** */
export class HarnessSection {
  acp = structuredClone(HARNESS_DEFAULTS.acp,);

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<HarnessSection>,) {
    Object.assign(this, overrides,);
  }
}

/**
 * A concrete ACP model id: `provider/id` — the only shape ACP accepts via
 * `session/set_config_option`. Role aliases (`@smol`) never appear on the
 * wire, so they are rejected here instead of rotting until dispatch time.
 * @param model
 */
export function isConcreteModelId(model: string,): boolean {
  return model.length > 0 && !model.startsWith("@",) && /^[^/]+\/[^/]+$/.test(model,);
}

/**
 * Validate the `harness.acp.profiles` list after defaults are applied.
 * @param acp - the `harness.acp` sub-config to check
 * @throws {Error} If any profile is malformed: duplicate name, empty command,
 * unknown tier key, missing/invalid tier model, unknown capability, or a
 * non-numeric limit.
 */
export function validateAcpProfiles(acp: HarnessConfig["acp"],): void {
  if (!acp.enabled) { return; }
  const seen = new Set<string>();
  for (const p of acp.profiles) { validateProfile(p, seen,); }
}

/**
 * Validate one profile entry.
 * @param p - profile config
 * @param seen - names already observed (for duplicate detection)
 * @throws {Error} If the profile is malformed (see {@link validateAcpProfiles}).
 */
function validateProfile(p: AcpProfileConfig, seen: Set<string>,): void {
  if (typeof p.name !== "string" || p.name.trim() === "") {
    throw new Error("harness.acp.profiles[] entry is missing a name",);
  }

  if (seen.has(p.name,)) {
    throw new Error(`harness.acp.profiles: duplicate profile name "${p.name}"`,);
  }

  seen.add(p.name,);
  if (
    !Array.isArray(p.command,) || p.command.length === 0 || p.command.some((c,) => typeof c !== "string" || c === "")
  ) {
    throw new Error(`harness.acp.profiles["${p.name}"]: command must be a non-empty argv array of strings`,);
  }

  const tierKeys = Object.keys(p.tiers ?? {},);
  if (tierKeys.length === 0) {
    throw new Error(`harness.acp.profiles["${p.name}"]: at least one tier (good/fast) is required`,);
  }

  for (const key of tierKeys) {
    if (!HARNESS_TIERS.includes(key as HarnessTierId,)) {
      throw new Error(
        `harness.acp.profiles["${p.name}"]: unknown tier key "${key}" (allowed: ${HARNESS_TIERS.join(", ",)})`,
      );
    }

    validateTier(p.name, key as HarnessTierId, p.tiers[key as HarnessTierId],);
  }

  if (p.limits !== undefined) { validateLimits(p.name, p.limits,); }
}

/**
 * Validate one tier mapping.
 * @param name - profile name (for the error message)
 * @param tier - tier key
 * @param tierCfg - the tier's config
 * @throws {Error} If the model id or capability list is invalid.
 */
function validateTier(name: string, tier: HarnessTierId, tierCfg: AcpProfileConfig["tiers"][HarnessTierId],): void {
  if (!tierCfg || typeof tierCfg.model !== "string" || !isConcreteModelId(tierCfg.model,)) {
    throw new Error(
      `harness.acp.profiles["${name}"].tiers.${tier}.model must be a concrete "provider/id" model id (role aliases like "@smol" are not valid over ACP)`,
    );
  }

  const caps = tierCfg.capabilities ?? [];
  if (!Array.isArray(caps,) || caps.some((c,) => !HARNESS_CAPABILITIES.includes(c,))) {
    throw new Error(
      `harness.acp.profiles["${name}"].tiers.${tier}.capabilities must be a subset of [${
        HARNESS_CAPABILITIES.join(", ",)
      }]`,
    );
  }
}

/**
 * Validate profile limits.
 * @param name - profile name
 * @param limits - the limits block
 * @throws {Error} If a limit is not a positive finite number.
 */
function validateLimits(name: string, limits: NonNullable<AcpProfileConfig["limits"]>,): void {
  for (const key of ["rpm", "tokensPerDay",] as const) {
    const v = limits[key];
    if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v,) || v <= 0)) {
      throw new Error(`harness.acp.profiles["${name}"].limits.${key} must be a positive number`,);
    }
  }
}

/** JSON-schema metadata for the `harness` section. */
export const harnessMeta = {
  type: "object" as const,
  description: "External harness integration (ACP-speaking agents: omp, opencode, ...)",
  properties: {
    acp: {
      type: "object",
      description: "ACP harness profiles (per-process stdio JSON-RPC agents)",
      properties: {
        enabled: { type: "boolean", default: false, description: "Enable the ACP harness integration", },
        profiles: {
          type: "array",
          description: "External harness profiles in failover preference order",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "loop-lore-local profile id (unique)", },
              command: {
                type: "array",
                items: { type: "string", },
                description: "Spawn argv for the ACP server (stdio NDJSON)",
              },
              strategy: {
                type: "string",
                enum: ["failover", "best-of", "split",],
                description: "Multi-profile strategy (only failover implemented)",
              },
              tiers: {
                type: "object",
                description: "Tier → concrete model mapping",
                properties: {
                  good: { type: "object", description: "Strong tier (planning/design/review)", },
                  fast: { type: "object", description: "Cheap tier (mechanical work)", },
                },
              },
              limits: {
                type: "object",
                description: "loop-lore-side usage caps (optional; missing = unlimited)",
                properties: {
                  rpm: { type: "integer", description: "Max dispatches per rolling 60s", },
                  tokensPerDay: { type: "integer", description: "Max tokens per rolling 24h", },
                },
              },
              health: {
                type: "object",
                description: "Circuit-breaker thresholds (optional)",
                properties: {
                  maxConsecutiveFailures: { type: "integer", description: "Failures before the breaker opens", },
                  cooldownMs: { type: "integer", description: "Open-breaker cooldown in ms", },
                },
              },
            },
          },
        },
      },
    },
  },
  required: ["acp",] as const,
};
