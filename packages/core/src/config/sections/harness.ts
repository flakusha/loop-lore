// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/harness.ts — external-harness config section
//
// Defaults + section class + JSON-schema meta for `harness.acp`, plus the
// semantic validation the JSON schema cannot express (unknown tier keys,
// non-`provider/id` models, duplicate profile names).

import { type Stats, statSync, } from "node:fs";
import { resolve, } from "node:path";
import {
  type AcpProfileConfig,
  HARNESS_CAPABILITIES,
  HARNESS_FLAVORS,
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
 * unknown tier key, missing/invalid tier model, unknown capability, a
 * non-numeric limit, or a non-boolean ToS acknowledgement flag.
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
  if (p.harness !== undefined && !HARNESS_FLAVORS.includes(p.harness,)) {
    throw new Error(
      `harness.acp.profiles["${p.name}"]: unknown harness flavor "${p.harness}" (allowed: ${
        HARNESS_FLAVORS.join(", ",)
      })`,
    );
  }

  if (p.strategy !== undefined && p.strategy !== "failover") {
    throw new Error(
      `harness.acp.profiles["${p.name}"]: strategy "${p
        .strategy as string}" is not implemented (only "failover" is supported)`,
    );
  }

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

  if (p.sandboxRoot !== undefined) { validateSandboxRoot(p.name, p.sandboxRoot,); }

  if (p.tosGrayzoneAcknowledged !== undefined && typeof p.tosGrayzoneAcknowledged !== "boolean") {
    throw new Error(
      `harness.acp.profiles["${p.name}"].tosGrayzoneAcknowledged must be a boolean`,
    );
  }
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
 * Validate one profile's sandbox root: an existing directory, no traversal.
 * Fail closed at config load — a root that does not exist (or is not a
 * directory) would make every permission ask judge paths against a
 * non-existent scope, so the config must not load with one.
 * @param name - profile name (for the error message)
 * @param root - the configured sandbox root
 * @throws {Error} If the root is empty, carries a `..` segment, does not
 *   exist, or is not a directory.
 */
function validateSandboxRoot(name: string, root: string,): void {
  if (typeof root !== "string" || root.trim() === "") {
    throw new Error(`harness.acp.profiles["${name}"].sandboxRoot must be a non-empty path`,);
  }

  if (root.split(/[\\/]+/,).includes("..",)) {
    throw new Error(
      `harness.acp.profiles["${name}"].sandboxRoot must not contain ".." traversal (got "${root}")`,
    );
  }

  const resolved = resolve(root,);
  let stats: Stats;
  try {
    stats = statSync(resolved,);
  } catch {
    throw new Error(
      `harness.acp.profiles["${name}"].sandboxRoot "${root}" does not exist (resolved to "${resolved}")`,
    );
  }

  if (!stats.isDirectory()) {
    throw new Error(`harness.acp.profiles["${name}"].sandboxRoot "${root}" is not a directory`,);
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
              harness: {
                type: "string",
                enum: [...HARNESS_FLAVORS,],
                default: "omp",
                description: "Which shipped ACP adapter speaks this profile (default omp)",
              },
              command: {
                type: "array",
                items: { type: "string", },
                description: "Spawn argv for the ACP server (stdio NDJSON)",
              },
              strategy: {
                type: "string",
                enum: ["failover",],
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
              tosGrayzoneAcknowledged: {
                type: "boolean",
                default: false,
                description:
                  "Explicit acknowledgement that harness-as-provider use of this profile for RPG/other non-chat functionalities may conflict with the provider's ToS when the profile is subscription-backed. Local execution and direct API access are unaffected. Absent/false: the profile keeps flowing exactly as today (this flag records consent only; runtime gating lives in the dispatch guard)",
              },
              health: {
                type: "object",
                description: "Circuit-breaker thresholds (optional)",
                properties: {
                  maxConsecutiveFailures: { type: "integer", description: "Failures before the breaker opens", },
                  cooldownMs: { type: "integer", description: "Open-breaker cooldown in ms", },
                },
              },
              sandboxRoot: {
                type: "string",
                description:
                  'Directory the profile\'s permission asks are judged against (must exist; no ".." traversal). Absent = the process cwd',
              },
            },
          },
        },
      },
    },
  },
  required: ["acp",] as const,
};
