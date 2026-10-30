// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Chat-list row actions: rename, pin, archive, delete, batch operations. */
export interface ChatCoreChatListActions {
  renameChat(chatId: string,): Promise<void>;
  openRenameModal(chatId: string,): void;
  confirmRenameChat(): Promise<void>;
  deleteChat(chatId: string, event: Event,): Promise<void>;
  toggleChatPin(chatId: string,): Promise<void>;
  unarchiveChat(chatId: string,): Promise<void>;
  toggleChatSelection(chatId: string,): void;
  batchArchive(): Promise<void>;
  batchDelete(): Promise<void>;
  batchExport(): Promise<void>;
  openOwnershipTransferModal(): void;
  closeOwnershipTransferModal(): void;
  submitOwnershipTransfer(): Promise<void>;
  canTransferOwnership(): boolean;
  loadChatOwners(): Promise<void>;
  ownerCapReached(): boolean;
  ownerName(userId: string,): string;
  addableParticipants(): { actor_id: string; name: string; display_name?: string }[];
  openAddOwnerModal(): void;
  closeAddOwnerModal(): void;
  submitAddOwner(): Promise<void>;
  openRemoveOwnerModal(userId: string,): void;
  closeRemoveOwnerModal(): void;
  submitRemoveOwner(): Promise<void>;
  loadPersonas(): Promise<void>;
  setPersona(): Promise<void>;
  toggleGroupPause(): Promise<void>;
}
