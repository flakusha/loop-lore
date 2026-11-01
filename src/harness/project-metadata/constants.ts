// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Runtime constant lists for the project metadata manifest — the single
 * source for every enum lattice (HARNESS_TIERS precedent,
 * `src/config/schema/harness.ts`): the list IS the validator input and the
 * type derives from it, so wire/validation cannot drift.
 *
 * Ground truth: `.tmp/research/ProjectMetadata-SPEC-DRAFT.md` (v1) + the
 * USER-APPROVED 2026-11-01 `.metadata/` folder extension.
 *
 * @module project-metadata/constants
 */

/** The one supported manifest major. `metadata_version` must equal this. */
export const METADATA_VERSION = 1;

/** Shareability tiers, ascending restriction → reach (spec §3 lattice). */
export const SHAREABILITY_TIERS = [
  "throwaway",
  "isolated-private",
  "linkable",
  "packageable",
  "collaborative",
] as const;

/** A shareability tier. */
export type ShareabilityTier = (typeof SHAREABILITY_TIERS)[number];

/** What the scope root is. */
export const IDENTITY_KINDS = ["project", "worktree",] as const;

/** Identity kind value. */
export type MetadataIdentityKind = (typeof IDENTITY_KINDS)[number];

/** Declared network posture ladder (spec §3). Unknown values degrade to `undeclared`. */
export const SECURITY_NETWORK_MODES = ["undeclared", "none", "egress", "full",] as const;

/** Network posture value. */
export type SecurityNetwork = (typeof SECURITY_NETWORK_MODES)[number];

/** Declared secrets posture ladder (spec §3). */
export const SECURITY_SECRETS_MODES = ["undeclared", "none", "references-only", "files-present",] as const;

/** Secrets posture value. */
export type SecuritySecrets = (typeof SECURITY_SECRETS_MODES)[number];

/** Declared subprocess posture ladder (spec §3). */
export const SECURITY_SUBPROCESS_MODES = ["undeclared", "none", "toolchain-only", "arbitrary",] as const;

/** Subprocess posture value. */
export type SecuritySubprocess = (typeof SECURITY_SUBPROCESS_MODES)[number];

/** Audit hooks a manifest can force-log (spec §3). */
export const AUDIT_HOOKS = ["exec", "network", "file-write-outside", "secret-read",] as const;

/** Audit hook name. */
export type AuditHook = (typeof AUDIT_HOOKS)[number];

/** Plugin extension points a project may declare (R A4.2). */
export const PLUGIN_SCOPES = ["routes", "tools", "agentRoles", "uiComponents", "eventHandlers", "migrations",] as const;

/** Plugin scope value. */
export type PluginScope = (typeof PLUGIN_SCOPES)[number];

/** Plugin provenance origins (R A4.1). */
export const PLUGIN_ORIGINS = ["core", "community", "local",] as const;

/** Plugin origin value. */
export type PluginOrigin = (typeof PLUGIN_ORIGINS)[number];

/** Remote host kinds. */
export const HOST_KINDS = ["github", "gitlab", "other",] as const;

/** Host kind value. */
export type HostKind = (typeof HOST_KINDS)[number];

/** Remote visibility values. */
export const REMOTE_VISIBILITIES = ["unknown", "private", "internal", "public",] as const;

/** Remote visibility value. */
export type RemoteVisibility = (typeof REMOTE_VISIBILITIES)[number];

/**
 * Fixed (non-prefixed) `remotes[].auth_class` shapes. Prefixed shapes are
 * `token-env:<VAR>` (names an env var — never the token) and `principal:<id>`
 * (references principal-credential records, spec §7.1.3); parsed by
 * `parseAuthClass` in normalize.ts.
 */
export const AUTH_CLASS_FIXED = ["none", "ssh-agent", "credential-helper",] as const;

/** Fixed auth class value. */
export type AuthClassFixed = (typeof AUTH_CLASS_FIXED)[number];

/** Auth-class prefix shapes; the suffix is a reference, never a secret. */
export const AUTH_CLASS_PREFIXES = ["token-env:", "principal:",] as const;

/** Stance toward package manifests (spec §3 `[sync]`), ascending authority. */
export const SYNC_STANCES = ["observe", "declared", "authoritative",] as const;

/** Sync stance value. */
export type SyncStance = (typeof SYNC_STANCES)[number];

/** Memory scope modes, ascending breadth: none < user < world (spec §3). */
export const CONTEXT_MEMORY_MODES = ["none", "user", "world",] as const;

/** Context memory value. */
export type ContextMemory = (typeof CONTEXT_MEMORY_MODES)[number];

/** `.metadata/` folder item kinds (USER-APPROVED 2026-11-01 extension). */
export const METADATA_ITEM_KINDS = ["linkable", "regeneratable",] as const;

/** Metadata folder item kind. */
export type MetadataItemKind = (typeof METADATA_ITEM_KINDS)[number];

/** Structured audit-event types the loader/validator emit (spec §6.3). */
export const METADATA_EVENT_TYPES = [
  "metadata_version_future",
  "metadata_enum_unknown",
  "metadata_item_escape",
  "metadata_conflict",
] as const;

/** Audit event type name. */
export type MetadataEventType = (typeof METADATA_EVENT_TYPES)[number];

/** Finding codes the validator reports. */
export const METADATA_FINDING_CODES = [
  "parse",
  "missing_version",
  "invalid_version",
  "unsupported_version",
  "unknown_enum_policy",
  "unknown_enum_advisory",
  "type_mismatch",
  "item_name_invalid",
  "item_escape",
  "item_missing",
  "item_undeclared",
  "secret_shape",
] as const;

/** Finding code value. */
export type MetadataFindingCode = (typeof METADATA_FINDING_CODES)[number];

/** Validator finding severity. */
export const METADATA_FINDING_SEVERITIES = ["error", "warning", "lint",] as const;

/** Finding severity value. */
export type MetadataFindingSeverity = (typeof METADATA_FINDING_SEVERITIES)[number];

/** Where a resolved manifest came from. */
export const METADATA_SOURCES = ["default", "main", "worktree",] as const;

/** Metadata source value. */
export type MetadataSource = (typeof METADATA_SOURCES)[number];
