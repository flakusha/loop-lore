// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Body Systems — Public API
 *
 * Re-exports all body system services for use by routes and other modules.
 */
export { BodySystemService, } from "./service";
export type {
  BodyModification,
  BodyProfile,
  HeatCycleState,
  UpdateBodyProfileOpts,
} from "./service";
