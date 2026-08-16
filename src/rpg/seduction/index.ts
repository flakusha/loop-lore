// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Seduction System — Public API
 *
 * Re-exports all seduction services for use by routes and other modules.
 */
export { SeductionService, } from "./service";
export type {
  ArousalState,
  DesireProfile,
  SeductionAttemptOpts,
  SeductionResult,
  SeductionSkill,
} from "./service";
