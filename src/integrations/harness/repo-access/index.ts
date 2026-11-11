// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * repo-access — the RSI repo-root access tier (epic-harness-rsi-repo-access).
 *
 * SECURITY BOUNDARY: this tier lets the server-resolved `internal-service`
 * principal execute repo commands and touch repo-root paths. It is disabled
 * by default (settings.ts), gated fail-closed at every decision point
 * (gate.ts), scoped by principal kind (principal-scope.ts), and audited per
 * decision into `tool_call_audit` (migration 092). Only the operator may
 * enable it — file config `harness.repoAccess.enabled` or the admin
 * harness-settings override; nothing in the codebase auto-enables it.
 */
export {
  HARNESS_REPO_CAPABILITIES,
  type RepoCapability,
  toRepoCapability,
} from "./capabilities";
export {
  assertRepoAccessExecution,
  REPO_ACCESS_AUDIT_TOOL,
  type RepoAccessGateInput,
  type RepoAccessVerdict,
  type RepoRootChangeDenial,
  type RepoRootChangeInput,
  requestRepoRootChange,
} from "./gate";
export {
  DEFAULT_KIND_GRANTS,
  holdsCapability,
  resolveRepoGrants,
  type ResolveRepoGrantsInput,
} from "./grants";
export {
  assertParamsWithinPrincipalScope,
  type PrincipalScopeInput,
  type RepoAccessPrincipal,
  type RepoScopeResolution,
  resolveScopeRoot,
  setRepoScopeRootDetectorForTests,
} from "./principal-scope";
export {
  applyStoredRepoAccessSettings,
  getRepoAccessSettings,
  initRepoAccessSettings,
  REPO_ACCESS_SETTINGS_ENABLED_KEY,
  repoAccessSettings,
  type RepoAccessSettingsView,
  resetRepoAccessSettings,
  saveRepoAccessSettings,
} from "./settings";
