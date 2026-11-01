// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Precedence merge (spec §1.3): the worktree manifest may only NARROW the
 * main repo's declared policy; advisory dims are declared-wins; arrays
 * replace (never merge). Layer 1 (instance ceilings) is SKIPPED in v1 — the
 * `harness.projects` config section does not exist yet (see
 * {@link InstanceProjectCeilings}); layer 6 (approvals store) is out of
 * scope v1, which is also why guard ENFORCEMENT is deferred.
 *
 * Conflict attempts (worktree declaring wider than main) keep the narrower
 * value and record a `metadata_conflict` audit event — events, never
 * exceptions (spec §4).
 *
 * @module project-metadata/resolve
 */
import { CONTEXT_MEMORY_MODES, METADATA_VERSION, SHAREABILITY_TIERS, SYNC_STANCES, } from "./constants";
import type { AuditHook, PluginScope, ShareabilityTier, SyncStance, } from "./constants";
import {
  narrowNetwork,
  narrowOrdered,
  narrowOriginCeiling,
  narrowSecrets,
  narrowSubprocess,
} from "./lattices";
import type { MetadataContext, MetadataEvent, ResolvedProjectMetadata, } from "./types";

/**
 * Instance-side policy ceilings — spec §1.3 layer 1, to be read from the
 * `harness.projects` config section. That section DOES NOT exist in the
 * config schema today (HarnessConfig is `{ acp }` only), so the instance
 * layer is skipped in v1; this typed placeholder pins the shape the section
 * must produce when it lands. No config-schema surface is added in v1.
 */
export interface InstanceProjectCeilings {
  /** Widest tier the instance allows; declared tiers above it clamp down. */
  maxShareability?: ShareabilityTier;
  /** Widest plugin scope set the instance allows. */
  maxPluginScopes?: PluginScope[];
  /** Instance-default context posture (narrower than project-declared wins). */
  defaultContext?: MetadataContext;
}

/** Record one `metadata_conflict` audit event (events, never exceptions). */
function conflict(events: MetadataEvent[], dim: string, detail: string, scopeRoot: string,): void {
  events.push({ type: "metadata_conflict", dim, detail, scopeRoot, },);
}

/** Attempted-widening guard for booleans (opt-in flags). */
function narrowFlag(
  events: MetadataEvent[],
  scopeRoot: string,
  dim: string,
  mainValue: boolean,
  worktreeValue: boolean,
): boolean {
  if (worktreeValue && !mainValue) {
    conflict(events, dim, "worktree attempted to enable a flag the main repo does not grant; kept false", scopeRoot,);
    return false;
  }

  return mainValue && worktreeValue;
}

/**
 * Merge the worktree layer into the main layer under the narrowing rule.
 * Policy dims take the narrower value (conflict events on attempted
 * widening); advisory dims are declared-wins with worktree-absence falling
 * back to the main layer; arrays replace. `items` come from the worktree
 * layer — the effective scope root's own folder + declarations.
 */
export function mergeWorktreeNarrowing(
  main: ResolvedProjectMetadata,
  worktree: ResolvedProjectMetadata,
): ResolvedProjectMetadata {
  const events = [...main.events, ...worktree.events,];
  const root = worktree.scopeRoot;

  const tier = narrowOrdered(SHAREABILITY_TIERS, main.shareability.tier, worktree.shareability.tier,);
  if (tier !== worktree.shareability.tier) {
    conflict(
      events,
      "shareability.tier",
      `worktree declared "${worktree.shareability.tier}" > main "${main.shareability.tier}"; clamped to "${tier}"`,
      root,
    );
  }

  const eligible = narrowFlag(
    events,
    root,
    "integration.plugin.eligible",
    main.integration.plugin.eligible,
    worktree.integration.plugin.eligible,
  );

  const scopes = worktree.integration.plugin.scopes.filter((scope,) => main.integration.plugin.scopes.includes(scope,));
  const droppedScopes = worktree.integration.plugin.scopes.filter((scope,) =>
    !main.integration.plugin.scopes.includes(scope,)
  );

  if (droppedScopes.length > 0) {
    conflict(
      events,
      "integration.plugin.scopes",
      `worktree scopes not granted by main dropped: [${droppedScopes.join(", ",)}]`,
      root,
    );
  }

  const originCeiling = narrowOriginCeiling(
    main.integration.plugin.originCeiling,
    worktree.integration.plugin.originCeiling,
  );

  if (originCeiling !== worktree.integration.plugin.originCeiling) {
    conflict(
      events,
      "integration.plugin.origin_ceiling",
      `worktree ceiling "${worktree.integration.plugin.originCeiling}" wider than main; kept "${main.integration.plugin.originCeiling}"`,
      root,
    );
  }

  const memory = narrowOrdered(CONTEXT_MEMORY_MODES, main.context.memory, worktree.context.memory,);
  if (memory !== worktree.context.memory) {
    conflict(
      events,
      "context.memory",
      `worktree declared "${worktree.context.memory}" > main "${main.context.memory}"; kept "${memory}"`,
      root,
    );
  }

  const syncPackage = narrowOrdered(SYNC_STANCES, main.sync.package, worktree.sync.package,);
  if (syncPackage !== worktree.sync.package) {
    conflict(
      events,
      "sync.package",
      `worktree declared "${worktree.sync.package}" > main "${main.sync.package}"; kept "${syncPackage}"`,
      root,
    );
  }

  const fields: Record<string, SyncStance> = { ...main.sync.fields, };
  for (const [field, stance,] of Object.entries(worktree.sync.fields,)) {
    const mainStance = fields[field];
    fields[field] = mainStance === undefined ? stance : narrowOrdered(SYNC_STANCES, mainStance, stance,);
  }

  const network = narrowNetwork(main.security.network, worktree.security.network,);
  const secrets = narrowSecrets(main.security.secrets, worktree.security.secrets,);
  const subprocess = narrowSubprocess(main.security.subprocess, worktree.security.subprocess,);
  const auditHooks: AuditHook[] = [...main.security.auditHooks,];
  for (const hook of worktree.security.auditHooks) {
    if (!auditHooks.includes(hook,)) { auditHooks.push(hook,); }
  }

  return {
    metadataVersion: METADATA_VERSION,
    source: "worktree",
    scopeRoot: root,
    // Identity keys out-of-band approvals — main layer wins.
    identity: main.identity,
    shareability: {
      tier,
      sameInstanceProjects: narrowFlag(
        events,
        root,
        "shareability.same_instance_projects",
        main.shareability.sameInstanceProjects,
        worktree.shareability.sameInstanceProjects,
      ),
    },
    stack: {
      // Declared-wins advisory: worktree values when declared, else main's.
      runtimes: worktree.stack.runtimes.length > 0 ? worktree.stack.runtimes : main.stack.runtimes,
      tools: { ...main.stack.tools, ...worktree.stack.tools, },
      build: worktree.stack.build !== "" ? worktree.stack.build : main.stack.build,
      test: worktree.stack.test !== "" ? worktree.stack.test : main.stack.test,
      checkout: worktree.stack.checkout.length > 0 ? worktree.stack.checkout : main.stack.checkout,
    },
    security: { network, secrets, subprocess, auditHooks, },
    integration: {
      plugin: { eligible, scopes, originCeiling, },
      rsi: {
        pinnedVersion: worktree.integration.rsi.pinnedVersion !== ""
          ? worktree.integration.rsi.pinnedVersion
          : main.integration.rsi.pinnedVersion,
        surface: worktree.integration.rsi.surface !== ""
          ? worktree.integration.rsi.surface
          : main.integration.rsi.surface,
      },
    },
    // Arrays replace: the worktree's declared list replaces the main list.
    remotes: worktree.remotes.length > 0 ? worktree.remotes : main.remotes,
    sync: { package: syncPackage, fields, },
    context: {
      memory,
      crossProjectSearch: narrowFlag(
        events,
        root,
        "context.cross_project_search",
        main.context.crossProjectSearch,
        worktree.context.crossProjectSearch,
      ),
      worldData: narrowFlag(events, root, "context.world_data", main.context.worldData, worktree.context.worldData,),
    },
    items: worktree.items,
    events,
    findings: [...main.findings, ...worktree.findings,],
    // Raw overlay = the effective scope's file.
    rawText: worktree.rawText,
    parsed: worktree.parsed,
  };
}
