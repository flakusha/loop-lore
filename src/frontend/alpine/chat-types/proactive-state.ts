// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Proactive messaging scheduler (chat-proactive.ts) — polls for due messages. */
export interface ChatCoreProactiveState {
  /** Guard: a selectChat() run is in flight — ignore overlapping calls. */
  _selectingChat: boolean;
  _proactiveTimer: ReturnType<typeof setInterval> | null;
  _proactiveInFlight: boolean;
  _proactiveLastSendAt: number;
  startProactiveScheduler(): void;
  stopProactiveScheduler(): void;
  tickProactive(): Promise<void>;
}
