// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC Navigation — Public API
 *
 * Re-exports NPC navigation services for use by routes and other modules.
 */
export { NpcNavigationService, } from "./service";
export type {
  LocationConnection,
  MovementResult,
  NpcMovementState,
} from "./service";
export { MovementPattern, } from "./service";
