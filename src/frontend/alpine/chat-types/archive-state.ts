/** Message archive/restore state. */
export interface ChatArchiveState {
  _archiveConfirmOpen: boolean;
  _archiveConfirmId: string | null;
  archiveMessage(messageId: string,): Promise<void>;
  restoreMessage(messageId: string,): Promise<void>;
  confirmArchive(): Promise<void>;
  cancelArchive(): void;
}
