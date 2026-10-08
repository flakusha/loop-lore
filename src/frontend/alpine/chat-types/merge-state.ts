// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { AlpineMagicThis, } from "../types";

/** One source tip in the merge wizard. */
export interface MergeSourceTip {
  tipMessageId: string;
  branchId: string | null;
}

/** One draft message from the LLM preview. */
export interface MergeDraftMessage {
  role: string;
  content: string;
}

/** One hunk in the overlay diff. */
export interface MergeHunk {
  status: "kept" | "applied" | "conflict";
  base: string[];
  overlay: string[];
  result: string[] | null;
}

/** Token estimate from the preview. */
export interface MergeTokenEstimate {
  sharedPrefix: number;
  perSource: number[];
}

/** Preview result from the server. */
export interface MergePreviewResult {
  mergeId: string;
  mode: string;
  kind: "llm" | "overlay";
  draft?: MergeDraftMessage[];
  hunks?: MergeHunk[];
  tokenEstimate: MergeTokenEstimate;
  truncated: boolean;
}

/** Confirm result from the server. */
export interface MergeConfirmResult {
  mergeId: string;
  resultMessageIds: string[];
  mergedBranchId: string;
  activeBranchId: string;
}

/** Continue result from the server. */
export interface MergeContinueResult {
  id: string;
  context: { mergeId: string; mergedTipId: string; replied: boolean };
}

/** Wizard step. */
export type MergeStep = "sources" | "mode" | "preview" | "confirm";

/** Merge wizard state on ChatState. */
export interface ChatMergeState extends AlpineMagicThis {
  /** Open the merge wizard. */
  openBranchMerge(sources?: MergeSourceTip[],): Promise<void>;
  /** Close the merge wizard. */
  closeBranchMerge(): void;
  /** Initiate a merge on the server. */
  initiateMerge(mode: string,): Promise<void>;
  /** Load the preview for the current merge. */
  loadPreview(regenerate?: boolean,): Promise<void>;
  /** Re-roll the preview (regenerate). */
  rerollPreview(): Promise<void>;
  /** Confirm the merge. */
  confirmMerge(branchName: string, activate: boolean,): Promise<void>;
  /** Continue from the merged tip. */
  continueFromMerge(prompt?: string,): Promise<void>;
  /** Reorder a source (move up or down). */
  reorderSource(index: number, direction: -1 | 1,): void;
  /** Remove a source from the list. */
  removeSource(index: number,): void;
  /** Set a conflict resolution for a hunk. */
  setConflictChoice(hunkIndex: number, resolution: "base" | "overlay" | "manual",): void;
  /** Check if all conflicts are resolved. */
  conflictsResolved(): boolean;
  /** Check if confirm is allowed. */
  canConfirm(): boolean;
  /** Get the default branch name. */
  defaultBranchName(): string;
  /** Current wizard step. */
  mergeStep: MergeStep;
  /** Merge ID from initiate. */
  mergeId: string | null;
  /** Selected sources (ordinal = array index). */
  mergeSources: MergeSourceTip[];
  /** Selected mode. */
  mergeMode: string | null;
  /** Preview result. */
  mergePreview: MergePreviewResult | null;
  /** Loading flag for preview. */
  mergePreviewLoading: boolean;
  /** Error message. */
  mergeError: string | null;
  /** Conflict resolutions (hunkIndex → "base" | "overlay" | "manual"). */
  mergeConflictChoices: Map<number, "base" | "overlay" | "manual">;
  /** Edited draft messages (for LLM modes). */
  mergeDraftEdits: MergeDraftMessage[];
  /** Branch name input. */
  mergeBranchName: string;
  /** Activate toggle. */
  mergeActivate: boolean;
}
