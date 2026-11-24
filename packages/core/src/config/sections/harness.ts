// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/harness.ts — external-harness config section
//
// Defaults + section class + JSON-schema meta for `harness.acp`, plus the
// semantic validation the JSON schema cannot express (unknown tier keys,
// non-`provider/id` models, duplicate profile names).

import { type Stats, statSync, } from "node:fs";
import { isAbsolute, resolve, } from "node:path";
import {
  type AcpProfileConfig,
  HARNESS_CAPABILITIES,
  HARNESS_FLAVORS,
  HARNESS_TIERS,
  HARNESS_TRANSPORTS,
  type HarnessConfig,
  type HarnessTierId,
} from "../schema/harness";

/** Defaults: harness integration is opt-in and empty; the repo-access tier is off. */
export const HARNESS_DEFAULTS: HarnessConfig = {
  acp: {
    enabled: false,
    profiles: [],
  },
  repoAccess: { enabled: false, },
};

/** Default breaker threshold when a profile omits `health`. */
export const HARNESS_DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

/** Default open-breaker cooldown when a profile omits `health`. */
export const HARNESS_DEFAULT_COOLDOWN_MS = 300_000;

/** */
export class HarnessSection {
  acp = structuredClone(HARNESS_DEFAULTS.acp,);
  repoAccess = structuredClone(HARNESS_DEFAULTS.repoAccess,);

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
 * non-numeric limit, reserved alias name, unsupported transport, or a
 * non-boolean ToS acknowledgement flag.
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
  if (p.name === "default") {
    throw new Error("harness.acp.profiles: default is reserved for implicit failover and cannot name a profile",);
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
  if (p.transport !== undefined && !HARNESS_TRANSPORTS.includes(p.transport,)) {
    throw new Error(
      `harness.acp.profiles["${p.name}"].transport "${
        String(p.transport,)
      }" is not implemented (only "acp" is supported)`,
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

  if (
    p.protocolVersion !== undefined &&
    (!Number.isInteger(p.protocolVersion,) || p.protocolVersion < 1 || p.protocolVersion > 2)
  ) {
    throw new Error(
      `harness.acp.profiles["${p.name}"].protocolVersion must be 1 or 2`,
    );
  }

  if (p.mcpServers !== undefined) { validateMcpServers(p.name, p.mcpServers,); }

  if (p.additionalDirectories !== undefined) { validateAdditionalDirectories(p.name, p.additionalDirectories,); }

  if (p.mode !== undefined && (typeof p.mode !== "string" || p.mode.trim() === "")) {
    throw new Error(
      `harness.acp.profiles["${p.name}"].mode must be a non-empty string`,
    );
  }

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
 * Validate one profile's MCP servers: non-empty name/command per entry, with
 * string argv and `{name,value}` env entries when present.
 * @param name - profile name (for the error message)
 * @param servers - the configured servers
 * @throws {Error} If the list or an entry is malformed.
 */
function validateMcpServers(name: string, servers: AcpProfileConfig["mcpServers"],): void {
  if (!Array.isArray(servers,)) {
    throw new Error(`harness.acp.profiles["${name}"].mcpServers must be an array`,);
  }

  for (const entry of servers) { validateMcpServer(name, entry,); }
}

/**
 * Validate one MCP server entry.
 * @param name - profile name (for the error message)
 * @param entry - the server entry
 * @throws {Error} If the entry is malformed.
 */
function validateMcpServer(name: string, entry: NonNullable<AcpProfileConfig["mcpServers"]>[number],): void {
  const prefix = `harness.acp.profiles["${name}"].mcpServers[]`;
  if (typeof entry?.name !== "string" || entry.name.trim() === "") {
    throw new Error(`${prefix} entry is missing a non-empty name`,);
  }

  if (typeof entry?.command !== "string" || entry.command === "") {
    throw new Error(`${prefix} "${entry.name}" is missing a command`,);
  }

  if (entry.args !== undefined && (!Array.isArray(entry.args,) || entry.args.some((a,) => typeof a !== "string"))) {
    throw new Error(`${prefix} "${entry.name}".args must be a string array`,);
  }

  if (
    entry.env !== undefined && (!Array.isArray(entry.env,) ||
      entry.env.some((e,) => typeof e?.name !== "string" || typeof e?.value !== "string"))
  ) {
    throw new Error(`${prefix} "${entry.name}".env must be a {name,value} array`,);
  }
}

/**
 * Validate one profile's additional directories: every entry an absolute
 * path. Fail closed at config load — the adapter also rejects a relative
 * entry before `session/new` goes out (defense in depth).
 * @param name - profile name (for the error message)
 * @param dirs - the configured roots
 * @throws {Error} If an entry is empty or not absolute.
 */
function validateAdditionalDirectories(name: string, dirs: AcpProfileConfig["additionalDirectories"],): void {
  if (!Array.isArray(dirs,)) {
    throw new Error(`harness.acp.profiles["${name}"].additionalDirectories must be an array`,);
  }

  for (const dir of dirs) {
    if (typeof dir !== "string" || dir.trim() === "") {
      throw new Error(`harness.acp.profiles["${name}"].additionalDirectories must be non-empty paths`,);
    }

    if (!isAbsolute(dir,)) {
      throw new Error(
        `harness.acp.profiles["${name}"].additionalDirectories must be absolute (got "${dir}")`,
      );
    }
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
              transport: {
                type: "string",
                enum: [...HARNESS_TRANSPORTS,],
                default: "acp",
                description: "Driver transport for this profile (only ACP stdio is implemented)",
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
              protocolVersion: {
                type: "number",
                description:
                  "ACP protocol version to request at initialize (default 1; 2 negotiates v2 when the agent supports it)",
              },
              mcpServers: {
                type: "array",
                description:
                  "MCP servers handed to the harness agent via session/new (stdio name/command/args/env, verbatim)",
                items: { type: "object", },
              },
              additionalDirectories: {
                type: "array",
                items: { type: "string", },
                description:
                  "Extra absolute workspace roots handed to the agent via session/new (relative entries are rejected)",
              },
              mode: {
                type: "string",
                description:
                  "Default mode id for session/set_mode (e.g. plan/act); absent = only explicitly passed ids are sent",
              },
            },
          },
        },
      },
    },
    repoAccess: {
      type: "object",
      description:
        "RSI repo-root access tier (DANGEROUS, default off): lets the server-resolved internal-service principal execute repo commands and touch repo-root paths (src/, .plan/, migrations, workflows). Every decision is audited to tool_call_audit; the gate fails closed",
      properties: {
        enabled: {
          type: "boolean",
          default: false,
          description:
            "Master switch for the repo-access tier. False (default) denies every repo-access execution regardless of principal or grants; only the operator may enable it",
        },
      },
    },
  },
  required: ["acp",] as const,
};
