// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** One viewer's seen-state row for a message. */
export interface SeenStateRow {
  actorId: string;
  state: string;
  seenAt: string | null;
}

/** Message read-receipts state and the popover that lists its viewers. */
export interface ChatCoreSeenState {
  _seenPopoverOpen: boolean;
  _seenPopoverX: number;
  _seenPopoverY: number;
  _seenPopoverViewers: SeenStateRow[];
  initSeenPopover(): void;
  _seenPollTimer: ReturnType<typeof setInterval> | null;
  startSeenPolling(): void;
  stopSeenPolling(): void;
  loadMessageSeen(msgId: string,): Promise<void>;
  loadAllSeen(): Promise<void>;
  markSeen(msgId: string, state: "seen" | "processing",): Promise<void>;
  openSeenPopover(msgId: string, event: Event,): void;
  seenTitle(seenState: SeenStateRow[],): string;
  seenCount(seenState: SeenStateRow[],): number;
}
