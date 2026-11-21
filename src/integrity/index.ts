// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export {
  clearRunning,
  defaultIntegrityPaths,
  detectUncleanShutdown,
  type IntegrityChecker,
  type IntegrityPaths,
  type IntegrityResult,
  markRunning,
  quarantineVerdict,
  runStartupIntegrityGate,
  SENTINEL_FILE,
  type SentinelFs,
} from "./crash-recovery";
export { isWriteBlocked, safeModeResponse, } from "./safe-mode";
export { createSqliteIntegrityChecker, } from "./sqlite-check";
export {
  clearSafeMode,
  enterSafeMode,
  getIntegrityState,
  type IntegrityState,
  type IntegrityVerdict,
  recordVerdict,
  resetIntegrityState,
  setUncleanShutdown,
} from "./state";
