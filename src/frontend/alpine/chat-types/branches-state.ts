// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { AlpineMagicThis, } from "../types";

/** One branch row from GET /api/v1/chats/:id/branches (FEAT-046 list metadata). */
export interface ChatBranchRow {
  id: string;
  chatId: string;
  /** Fork-point message id — the root of the branch's message chain. */
  parentMessageId: string;
  name: string;
  createdAt: string;
  isActive: boolean;
  messageCount: number;
  lastActivity: string | null;
}

/**
 * Branch controls (FEAT-047): header dropdown (list + switch), fork action
 * from the message context menu, and the fork-point indicator on messages.
 *
 * Display state (open flag, branch list) lives on `$store.ui` because the
 * chat-header dropdown is outside the chatState x-data scope; methods here
 * run on the chatState instance to reach `this.activeChat`.
 */
export interface ChatBranchesState extends AlpineMagicThis {
  /** Load branches for the active chat into `$store.ui.branches`. */
  loadBranches(): Promise<void>;
  /** Fork the active chat at `messageId`; prompts for a name when omitted. */
  forkFromMessage(messageId: string, name?: string,): Promise<void>;
  /** Switch the active branch (PATCH /chats/:id/active-branch). */
  switchBranch(branchId: string,): Promise<void>;
  /** Delete a branch (DELETE /chats/:id/branches/:branchId). */
  deleteBranch(branchId: string,): Promise<void>;
  /** Merge a branch into the active branch (POST /chats/:id/branches/:id/merge). */
  mergeBranch(branchId: string,): Promise<void>;
  /** Toggle the header dropdown (`$store.ui.showBranchMenu`). */
  toggleBranches(): void;
  /** Number of branches forked at `messageId` (0 = no indicator). */
  branchCountFor(messageId: string,): number;
}
