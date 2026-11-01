// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Typed schema for the project metadata manifest (`.metadata.toml`).
 *
 * Enum lattices live in `constants.ts` (runtime lists → derived types, so
 * wire/validation cannot drift). Ground truth:
 * `.tmp/research/ProjectMetadata-SPEC-DRAFT.md` (v1) with the USER-APPROVED
 * 2026-11-01 `.metadata/` folder extension.
 *
 * v1 scope: loader/validate/resolve/audit only. Guard ENFORCEMENT (shareability
 * ceilings gating scope changes) is out of scope — it depends on the
 * out-of-band approvals store (spec §5.1/§5.2) which does not exist yet.
 *
 * @module project-metadata/types
 */
import { METADATA_VERSION, } from "./constants";
import type {
  AuditHook,
  ContextMemory,
  HostKind,
  MetadataEventType,
  MetadataFindingCode,
  MetadataFindingSeverity,
  MetadataIdentityKind,
  MetadataItemKind,
  MetadataSource,
  PluginOrigin,
  PluginScope,
  RemoteVisibility,
  SecurityNetwork,
  SecuritySecrets,
  SecuritySubprocess,
  ShareabilityTier,
  SyncStance,
} from "./constants";

/** One structured metadata audit event — a row-shaped log line, not an exception. */
export interface MetadataEvent {
  /** Event discriminator. */
  type: MetadataEventType;
  /** Policy dimension involved, e.g. `shareability.tier` or `items.escape`. */
  dim: string;
  /** Human-readable detail (what was seen, what it became). */
  detail: string;
  /** Scope root the event was raised for. */
  scopeRoot: string;
}

/** One typed validation finding (spec §6.1 validate shape, typed). */
export interface MetadataFinding {
  severity: MetadataFindingSeverity;
  code: MetadataFindingCode;
  message: string;
  /** TOML pointer (`table.key`) or item name the finding is about. */
  pointer?: string;
}

/** `[identity]` — durable slug, root kind, optional world binding (R A3.3). */
export interface MetadataIdentity {
  id: string;
  kind: MetadataIdentityKind;
  /** Worlds.id binding; `""` = unbound. */
  worldRef: string;
}

/** `[shareability]`. */
export interface MetadataShareability {
  tier: ShareabilityTier;
  /** collaborative-only in-instance sibling access (spec §3). */
  sameInstanceProjects: boolean;
}

/** `[stack]` — declared layer; advisory, checkout automation reads it first. */
export interface MetadataStack {
  runtimes: string[];
  tools: Record<string, string>;
  /** Command string; `""` = fall back to observed layer. */
  build: string;
  test: string;
  /** Ordered post-clone steps; arrays replace, never merge (spec §1.3). */
  checkout: string[];
}

/** `[security]` — declared risk surface; sizes logging, never grants. */
export interface MetadataSecurity {
  network: SecurityNetwork;
  secrets: SecuritySecrets;
  subprocess: SecuritySubprocess;
  auditHooks: AuditHook[];
}

/** `[integration.plugin]`. */
export interface MetadataPluginIntegration {
  eligible: boolean;
  scopes: PluginScope[];
  originCeiling: PluginOrigin;
}

/** `[integration.rsi]`. */
export interface MetadataRsiIntegration {
  pinnedVersion: string;
  surface: string;
}

/** `[integration]`. */
export interface MetadataIntegration {
  plugin: MetadataPluginIntegration;
  rsi: MetadataRsiIntegration;
}

/** One `[[remotes]]` row — reference-only, never secrets (spec §5.4). */
export interface MetadataRemote {
  name: string;
  url: string;
  hostKind: HostKind;
  visibility: RemoteVisibility;
  /** Validated shape: fixed value or `token-env:<VAR>` / `principal:<id>`. */
  authClass: string;
  defaultBranch: string;
}

/** `[sync]`. */
export interface MetadataSync {
  package: SyncStance;
  /** Per-field stance overrides, e.g. `engines` → `observe`. */
  fields: Record<string, SyncStance>;
}

/** `[context]` — opt-IN only; defaults are the narrowest state. */
export interface MetadataContext {
  memory: ContextMemory;
  crossProjectSearch: boolean;
  worldData: boolean;
}

/** One `.metadata/` folder item (declared and/or present on disk). */
export interface MetadataItem {
  name: string;
  /** Declared `[items."name"]` kind, or null when undeclared. */
  kind: MetadataItemKind | null;
  description: string | null;
  /** True when `[items."name"]` declared it in the toml. */
  declared: boolean;
  /** True when the entry exists (and is contained) under `<root>/.metadata/`. */
  present: boolean;
}

/**
 * Fully resolved manifest: defaults applied, enums normalized, unknown keys
 * preserved. `rawText`/`parsed` carry the verbatim file + full parsed overlay
 * (including unknown/vendor keys — readers doing rewrites must round-trip
 * them, spec §1.4); both null for the absent-file default.
 */
export interface ResolvedProjectMetadata {
  metadataVersion: number;
  source: MetadataSource;
  scopeRoot: string;
  identity: MetadataIdentity;
  shareability: MetadataShareability;
  stack: MetadataStack;
  security: MetadataSecurity;
  integration: MetadataIntegration;
  remotes: MetadataRemote[];
  sync: MetadataSync;
  context: MetadataContext;
  /** `.metadata/` folder items; never affects policy dims (folder extension). */
  items: MetadataItem[];
  /** Audit events raised while resolving (conflicts, unknown enums, escapes). */
  events: MetadataEvent[];
  /** Validation findings (errors included — the loader degrades, never fails). */
  findings: MetadataFinding[];
  /** Verbatim `.metadata.toml` text, or null when absent/defaulted. */
  rawText: string | null;
  /** Full parsed TOML overlay (unknown keys preserved), or null. */
  parsed: Record<string, unknown> | null;
}

/** Absent-everywhere defaults (spec §2): exactly today's behavior. */
export const DEFAULT_METADATA: Readonly<ResolvedProjectMetadata> = Object.freeze(
  {
    metadataVersion: METADATA_VERSION,
    source: "default",
    scopeRoot: "",
    identity: { id: "", kind: "worktree", worldRef: "", },
    shareability: { tier: "throwaway", sameInstanceProjects: false, },
    stack: { runtimes: [], tools: {}, build: "", test: "", checkout: [], },
    security: { network: "undeclared", secrets: "undeclared", subprocess: "undeclared", auditHooks: [], },
    integration: {
      plugin: { eligible: false, scopes: [], originCeiling: "local", },
      rsi: { pinnedVersion: "", surface: "", },
    },
    remotes: [],
    sync: { package: "observe", fields: {}, },
    context: { memory: "user", crossProjectSearch: false, worldData: false, },
    items: [],
    events: [],
    findings: [],
    rawText: null,
    parsed: null,
  } satisfies ResolvedProjectMetadata,
);
