// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { QuickReplyButton, } from "../types";

/** Quick-reply buttons and automated (event-triggered) send guards. */
export interface ChatCoreQuickRepliesState {
  _quickReplies: QuickReplyButton[];
  _quickRepliesDirty: boolean;
  _startupFiredChat: string | null;
  /** Marks an automated (event-triggered) send so it doesn't re-trigger `user` events. */
  _autoFired: boolean;
  /** Epoch ms of the last automated send; drives the min-interval rate limit. */
  _lastAutoFireAt: number;
  /** Consecutive automated sends since the last human-initiated send; capped to break loops. */
  _consecutiveAutoFires: number;
  loadQuickReplies(): void;
  executeQuickReply(command: string,): Promise<void>;
  fireStartupQuickReplies(): Promise<void>;
  fireAutoQuickReplies(trigger: "user" | "ai",): Promise<void>;
  saveQuickReplies(): Promise<void>;
}
