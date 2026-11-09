// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { AlpineMagicThis, } from "../types";
import type { ChatParticipant, } from "./participants-state";

/** One party-split branch draft: destination location + member actor ids. */
export interface SplitBranchDraft {
  locationId: string;
  actorIds: string[];
  name: string;
}

/**
 * Party split / reunite execution state (T8 group-chat viewer).
 *
 * Backs `party-split-panel.html` against `POST /api/v1/chats/:id/split`
 * and `POST /api/v1/chats/:id/reunite`. Error fields carry the server's
 * `bad_request` message verbatim so the modal can show the refusal (unknown
 * location, non-participant actor, empty branch, non-owner) without
 * closing the draft.
 */
export interface ChatPartySplitState extends AlpineMagicThis {
  /** Branch drafts edited in the modal (≥2 to submit). */
  splitBranches: SplitBranchDraft[];
  /** True while the split POST is in flight. */
  splitBusy: boolean;
  /** Server refusal from the last split attempt; null when clean. */
  splitError: string | null;
  /** Secondary chat id typed into the reunite form. */
  reuniteSecondaryId: string;
  /** True while the reunite POST is in flight. */
  reuniteBusy: boolean;
  /** Server refusal from the last reunite attempt; null when clean. */
  reuniteError: string | null;
  /** Open the modal (seeds two empty drafts on first open). */
  openPartySplit(): void;
  /** Close the modal (draft preserved). */
  closePartySplit(): void;
  /** Append an empty branch draft. */
  addSplitBranch(): void;
  /** Remove a branch draft (no-op while only two remain). */
  removeSplitBranch(index: number,): void;
  /** Toggle an actor's membership in one branch draft. */
  toggleSplitActor(branchIndex: number, actorId: string,): void;
  /** POST the branch drafts; closes the modal only on success. */
  submitSplit(): Promise<void>;
  /** POST the reunite; closes the modal only on success. */
  submitReunite(): Promise<void>;
  /** Participant rows backing the split actor picker. */
  _participants: ChatParticipant[];
}
