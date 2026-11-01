// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Public API for the project metadata manifest (`.metadata.toml`) —
 * v1: loader, validator, resolver, audit sink. Guard ENFORCEMENT is
 * deferred until the out-of-band approvals store lands (spec §5.1/§5.2).
 *
 * @module project-metadata
 */
export {
  emitMetadataEvents,
  notifyScopeRootMetadata,
  resetMetadataHookForTests,
  resetMetadataLogSourceForTests,
  setMetadataLogSourceForTests,
} from "./audit";
export {
  AUDIT_HOOKS,
  AUTH_CLASS_FIXED,
  AUTH_CLASS_PREFIXES,
  CONTEXT_MEMORY_MODES,
  HOST_KINDS,
  IDENTITY_KINDS,
  METADATA_EVENT_TYPES,
  METADATA_FINDING_CODES,
  METADATA_FINDING_SEVERITIES,
  METADATA_ITEM_KINDS,
  METADATA_SOURCES,
  METADATA_VERSION,
  PLUGIN_ORIGINS,
  PLUGIN_SCOPES,
  REMOTE_VISIBILITIES,
  SECURITY_NETWORK_MODES,
  SECURITY_SECRETS_MODES,
  SECURITY_SUBPROCESS_MODES,
  SHAREABILITY_TIERS,
  SYNC_STANCES,
} from "./constants";
export type {
  AuditHook,
  AuthClassFixed,
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
export { isValidItemName, METADATA_FOLDER, } from "./items";
export {
  loadProjectMetadata,
  type LoadProjectMetadataOptions,
  METADATA_FILE,
  type MetadataError,
  type MetadataLoadResult,
} from "./load";
export type { InstanceProjectCeilings, } from "./resolve";
export { mergeWorktreeNarrowing, } from "./resolve";
export {
  DEFAULT_METADATA,
  type MetadataContext,
  type MetadataEvent,
  type MetadataFinding,
  type MetadataIdentity,
  type MetadataIntegration,
  type MetadataItem,
  type MetadataPluginIntegration,
  type MetadataRemote,
  type MetadataRsiIntegration,
  type MetadataSecurity,
  type MetadataShareability,
  type MetadataStack,
  type MetadataSync,
  type ResolvedProjectMetadata,
} from "./types";
export {
  type MetadataValidationResult,
  type ValidateProjectMetadataOptions,
  validateProjectMetadataText,
} from "./validate";
