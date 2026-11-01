// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-dimension normalizers: raw parsed TOML table → typed manifest slices
 * (core declared dims). Remote/sync/context access-surface normalizers live
 * in `access.ts`. Each normalizer is fail-closed per its dimension class
 * (spec §1.4) and records audit events + findings on the shared sink.
 *
 * @module project-metadata/dimensions
 */
import {
  AUDIT_HOOKS,
  IDENTITY_KINDS,
  PLUGIN_ORIGINS,
  PLUGIN_SCOPES,
  SECURITY_NETWORK_MODES,
  SECURITY_SECRETS_MODES,
  SECURITY_SUBPROCESS_MODES,
  SHAREABILITY_TIERS,
} from "./constants";
import type {
  AuditHook,
  MetadataIdentityKind,
  PluginOrigin,
  PluginScope,
  ShareabilityTier,
} from "./constants";
import {
  boolOr,
  scalarEnum,
  sinkFinding,
  stringList,
  stringOr,
  tableAt,
} from "./normalize";
import type { MetadataIssueSink, } from "./normalize";
import type {
  MetadataIdentity,
  MetadataIntegration,
  MetadataSecurity,
  MetadataShareability,
  MetadataStack,
} from "./types";

/** Normalize `[identity]` — id defaults to "" (loader fills the basename). */
export function normalizeIdentity(sink: MetadataIssueSink, doc: Record<string, unknown>,): MetadataIdentity {
  const table = tableAt(doc, "identity",);
  return {
    id: stringOr(sink, table.id, "identity.id", "identity.id",),
    kind: scalarEnum<MetadataIdentityKind>(sink, {
      value: table.kind,
      allowed: IDENTITY_KINDS,
      dim: "identity.kind",
      pointer: "identity.kind",
      fallbackMissing: "worktree",
      fallbackUnknown: "worktree",
      policy: true,
    },),
    worldRef: stringOr(sink, table.world_ref, "identity.world_ref", "identity.world_ref",),
  };
}

/** Normalize `[shareability]` — tier is the core policy dim. */
export function normalizeShareability(sink: MetadataIssueSink, doc: Record<string, unknown>,): MetadataShareability {
  const table = tableAt(doc, "shareability",);
  return {
    tier: scalarEnum<ShareabilityTier>(sink, {
      value: table.tier,
      allowed: SHAREABILITY_TIERS,
      dim: "shareability.tier",
      pointer: "shareability.tier",
      fallbackMissing: "throwaway",
      fallbackUnknown: "throwaway",
      policy: true,
    },),
    sameInstanceProjects: boolOr(
      sink,
      table.same_instance_projects,
      "shareability.same_instance_projects",
      "shareability.same_instance_projects",
    ),
  };
}

/** Normalize `[stack]` — advisory; unknown entries drop, arrays replace. */
export function normalizeStack(sink: MetadataIssueSink, doc: Record<string, unknown>,): MetadataStack {
  const table = tableAt(doc, "stack",);
  const tools: Record<string, string> = {};
  const rawTools = table.tools;
  if (rawTools !== undefined && rawTools !== null && typeof rawTools === "object" && !Array.isArray(rawTools,)) {
    for (const [name, version,] of Object.entries(rawTools,)) {
      tools[name] = stringOr(sink, version, `stack.tools.${name}`, `stack.tools.${name}`,);
    }
  } else if (rawTools !== undefined) {
    sinkFinding(sink, "error", "type_mismatch", "stack.tools: expected table", "stack.tools",);
  }

  return {
    runtimes: stringList(sink, {
      value: table.runtimes,
      allowed: null,
      dim: "stack.runtimes",
      pointer: "stack.runtimes",
      policy: false,
    },),
    tools,
    build: stringOr(sink, table.build, "stack.build", "stack.build",),
    test: stringOr(sink, table.test, "stack.test", "stack.test",),
    checkout: stringList(sink, {
      value: table.checkout,
      allowed: null,
      dim: "stack.checkout",
      pointer: "stack.checkout",
      policy: false,
    },),
  };
}

/** Normalize `[security]` — ladders are policy dims; unknown → `undeclared`. */
export function normalizeSecurity(sink: MetadataIssueSink, doc: Record<string, unknown>,): MetadataSecurity {
  const table = tableAt(doc, "security",);
  // Every ladder contains "undeclared", so the fallback casts are sound.
  const ladder = <T extends string,>(modes: readonly T[], key: string,): T =>
    scalarEnum<T>(sink, {
      value: table[key],
      allowed: modes,
      dim: `security.${key}`,
      pointer: `security.${key}`,
      fallbackMissing: "undeclared" as T,
      fallbackUnknown: "undeclared" as T,
      policy: true,
    },);

  return {
    network: ladder(SECURITY_NETWORK_MODES, "network",),
    secrets: ladder(SECURITY_SECRETS_MODES, "secrets",),
    subprocess: ladder(SECURITY_SUBPROCESS_MODES, "subprocess",),
    auditHooks: stringList(sink, {
      value: table.audit_hooks,
      allowed: AUDIT_HOOKS,
      dim: "security.audit_hooks",
      pointer: "security.audit_hooks",
      policy: false,
    },) as AuditHook[],
  };
}

/** Normalize `[integration]` — plugin eligibility/scopes are policy dims. */
export function normalizeIntegration(sink: MetadataIssueSink, doc: Record<string, unknown>,): MetadataIntegration {
  const table = tableAt(doc, "integration",);
  const plugin = tableAt(table, "plugin",);
  const rsi = tableAt(table, "rsi",);
  return {
    plugin: {
      eligible: boolOr(sink, plugin.eligible, "integration.plugin.eligible", "integration.plugin.eligible",),
      scopes: stringList(sink, {
        value: plugin.scopes,
        allowed: PLUGIN_SCOPES,
        dim: "integration.plugin.scopes",
        pointer: "integration.plugin.scopes",
        policy: true,
      },) as PluginScope[],
      // Unknown ceiling → "core": tightest provenance the reader knows.
      originCeiling: scalarEnum<PluginOrigin>(sink, {
        value: plugin.origin_ceiling,
        allowed: PLUGIN_ORIGINS,
        dim: "integration.plugin.origin_ceiling",
        pointer: "integration.plugin.origin_ceiling",
        fallbackMissing: "local",
        fallbackUnknown: "core",
        policy: true,
      },),
    },
    rsi: {
      pinnedVersion: stringOr(
        sink,
        rsi.pinned_version,
        "integration.rsi.pinned_version",
        "integration.rsi.pinned_version",
      ),
      surface: stringOr(sink, rsi.surface, "integration.rsi.surface", "integration.rsi.surface",),
    },
  };
}
