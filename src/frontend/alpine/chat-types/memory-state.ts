// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { AuditAction, AuditEntry, MemoryEntry, MemoryPanelState, } from "./memory";

// ── Memory System ───────────────────────────────────────────
/** */
export interface ChatMemoryState {
  memoryPanel: MemoryPanelState;
  loadMemories(): Promise<void>;
  toggleMemoryPanel(): void;
  searchMemories(): void;
  createMemory(): Promise<void>;
  deleteMemory(memoryId: string,): Promise<void>;
  toggleMemoryPin(memoryId: string,): Promise<void>;
  saveEditMemory(): Promise<void>;
  startEditMemory(mem: MemoryEntry,): void;
  cancelEditMemory(): void;
  _canWriteActiveTab(): boolean;
  _isInChat(mem: MemoryEntry,): boolean;
  _chatHasCopies(): boolean;
  rememberMessage(messageId: string, content: string,): Promise<void>;
  toggleMemoryInChat(mem: MemoryEntry,): Promise<void>;
  jumpToMemorySource(messageId: string,): void;
  approveMemory(id: string,): void;
  _setReviewStatus(id: string, status: "committed" | "rejected",): Promise<void>;
  _isWorldAdmin(): boolean;
  rejectMemory(id: string,): void;
  formatMemoryDate(value: string,): string;
  getFilteredMemories(): MemoryEntry[];
  getCurrentMemoryList(): MemoryEntry[];
  updateMemoryTokenCount(): void;
  _getCharacterActorId(): string | null;
  _updateTokenCount(): void;
  auditActions: AuditAction[];
  getFilteredAudit(): AuditEntry[];
  _auditUrl(cursor: string | null, action: AuditAction | null,): string | null;
  loadAudit(action?: AuditAction | null,): Promise<void>;
  loadMoreAudit(): Promise<void>;
  setAuditActionFilter(action: AuditAction | null,): Promise<void>;
}
