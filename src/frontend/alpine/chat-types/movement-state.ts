// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Movement-related types for chat state.
 */

/** Movement event from NPC movement indicator */
export interface MovementEvent {
  actorId: string;
  fromLocationId: string;
  toLocationId: string;
  pattern: string;
  timestamp: string;
}

/** Movement state slice for ChatState */
export interface ChatMovementState {
  /** Movement events for the current chat */
  movementEvents: MovementEvent[];
  loadingMovementEvents: boolean;
  loadMovementEvents(): Promise<void>;
  getMovementIcon(pattern: string,): string;
}
