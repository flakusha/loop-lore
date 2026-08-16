// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { MemoryEntry, MemoryPanelState, } from "./memory";

// ── Memory System ───────────────────────────────────────────
export interface ChatMemoryState {
  memoryPanel: MemoryPanelState;
  loadMemories(): Promise<void>;
  toggleMemoryPanel(): void;
  searchMemories(): void;
  createMemory(): Promise<void>;
  deleteMemory(memoryId: string,): Promise<void>;
  toggleMemoryPin(memoryId: string,): Promise<void>;
  getFilteredMemories(): MemoryEntry[];
  getCurrentMemoryList(): MemoryEntry[];
  updateMemoryTokenCount(): void;
  _getCharacterActorId(): string | null;
  _updateTokenCount(): void;
}
