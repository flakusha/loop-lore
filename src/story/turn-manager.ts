// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Turn Manager — Story Module Re-export
 *
 * The generalized TurnManager lives in src/turning/.
 * This file re-exports it for backward compatibility with story/ imports.
 *
 * Story-specific extensions (quality evaluation, world events) are handled
 * by GameMasterService, not by TurnManager itself.
 */
export { TurnManager, type TurnManagerOptions, } from "../turning/turn-manager";
