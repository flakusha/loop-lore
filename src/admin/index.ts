// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin Module Public API
 *
 * Barrel re-exports for the admin submodules. Direct submodule imports
 * keep working; new code SHOULD import from here instead.
 */
export {
  deleteConfig,
  getAllConfig,
  getConfig,
  getConfigValue,
  seedDefaults,
  setConfig,
} from "./config";
export type {
  ConfigEntry,
} from "./config";
export {
  clearModelOverride,
  getContextWindowForModel,
  listModelCapabilities,
  resolveModelCapabilities,
  setModelOverride,
  upsertModelCapabilities,
} from "./model-capabilities";
export type {
  ModelCapabilityRow,
  ResolvedModelCapabilities,
} from "./model-capabilities";
export {
  clearModelRoleOverride,
  getModelRoleOverrides,
  resolveAllModelRoles,
  resolveModelRole,
  setModelRoleOverride,
  VALID_ROLES,
} from "./model-roles";
export type {
  ModelRole,
  ResolvedModelRole,
} from "./model-roles";
export {
  getHealthCache,
  getProviderHealth,
  getUnhealthyProviders,
  hasUnhealthyProviders,
  providerToSummary,
  resetHealthCache,
  scanAllProviders,
} from "./provider-health";
export type {
  ProviderHealthStatus,
} from "./provider-health";
