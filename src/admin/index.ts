// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin Module Public API
 *
 * Barrel re-exports for the admin submodules. Direct submodule imports
 * keep working; new code SHOULD import from here instead.
 */
export {
  VALID_ROLES,
  resolveModelRole,
  resolveAllModelRoles,
  setModelRoleOverride,
  clearModelRoleOverride,
  getModelRoleOverrides,
} from "./model-roles";
export type {
  ResolvedModelRole,
  ModelRole,
} from "./model-roles";
export {
  getAllConfig,
  getConfig,
  getConfigValue,
  setConfig,
  deleteConfig,
  seedDefaults,
} from "./config";
export type {
  ConfigEntry,
} from "./config";
export {
  scanAllProviders,
  getHealthCache,
  getProviderHealth,
  hasUnhealthyProviders,
  getUnhealthyProviders,
  providerToSummary,
  resetHealthCache,
} from "./provider-health";
export type {
  ProviderHealthStatus,
} from "./provider-health";
export {
  upsertModelCapabilities,
  resolveModelCapabilities,
  listModelCapabilities,
  setModelOverride,
  clearModelOverride,
  getContextWindowForModel,
} from "./model-capabilities";
export type {
  ModelCapabilityRow,
  ResolvedModelCapabilities,
} from "./model-capabilities";
