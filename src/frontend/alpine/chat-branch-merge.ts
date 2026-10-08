// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  confirmMergeApi,
  continueFromMergeApi,
  initiateMergeApi,
  loadPreviewApi,
} from "./chat-branch-merge-api";
import { uiStore, } from "./chat-branch-merge-helpers";
import { awaitChatStateAction, callChatStateAction, } from "./chat-state-global";
import type {
  ChatMergeState,
  MergeSourceTip,
} from "./chat-types/merge-state";
import { t, } from "./i18n";
import type { ChatState, } from "./types";

/**
 * Merge wizard state machine (FEA-2026-047). Four steps: sources → mode →
 * preview → confirm. Each step calls the real `/api/v1/chats/:id/branch-merges`
 * endpoints. Non-2xx responses toast an error and do NOT mutate local state.
 */
export const chatBranchMerge: Partial<ChatMergeState> & ThisType<ChatState> = {
  mergeStep: "sources",
  mergeId: null,
  mergeSources: [],
  mergeMode: null,
  mergePreview: null,
  mergePreviewLoading: false,
  mergeError: null,
  mergeConflictChoices: new Map(),
  mergeDraftEdits: [],
  mergeBranchName: "",
  mergeActivate: true,

  /**
   * Open the merge wizard. Optionally pre-seed sources.
   * @param sources
   * @returns {Promise<void>}
   */
  async openBranchMerge(sources?: MergeSourceTip[],) {
    const store = uiStore();
    if (store) { store.mergeModalOpen = true; }
    this.mergeStep = "sources";
    this.mergeId = null;
    this.mergeSources = sources ?? [];
    this.mergeMode = null;
    this.mergePreview = null;
    this.mergePreviewLoading = false;
    this.mergeError = null;
    this.mergeConflictChoices = new Map();
    this.mergeDraftEdits = [];
    this.mergeBranchName = "";
    this.mergeActivate = true;
  },

  /**
   * Close the merge wizard and reset state.
   * @returns {void}
   */
  closeBranchMerge() {
    const store = uiStore();
    if (store) { store.mergeModalOpen = false; }
    this.mergeStep = "sources";
    this.mergeId = null;
    this.mergeSources = [];
    this.mergeMode = null;
    this.mergePreview = null;
    this.mergePreviewLoading = false;
    this.mergeError = null;
    this.mergeConflictChoices = new Map();
    this.mergeDraftEdits = [];
    this.mergeBranchName = "";
    this.mergeActivate = true;
  },

  /**
   * Initiate a merge on the server.
   * @param mode
   * @returns {Promise<void>}
   */
  async initiateMerge(mode: string,) {
    if (this.mergeSources.length < 2) { return; }
    this.mergeMode = mode;
    this.mergeError = null;
    const mergeId = await initiateMergeApi(this, { mode, sources: this.mergeSources, },);
    if (!mergeId) { return; }
    this.mergeId = mergeId;
    this.mergeStep = "preview";
    await this.loadPreview();
  },

  /**
   * Load the preview for the current merge.
   * @param regenerate
   * @returns {Promise<void>}
   */
  async loadPreview(regenerate = false,) {
    const mergeId = this.mergeId;
    if (!mergeId) { return; }
    this.mergePreviewLoading = true;
    this.mergeError = null;
    try {
      const preview = await loadPreviewApi(this, { mergeId, regenerate, },);
      if (!preview) { return; }
      this.mergePreview = preview;
      if (preview.kind === "llm" && preview.draft) {
        this.mergeDraftEdits = preview.draft.map((m,) => ({ role: m.role, content: m.content, }));
      }

      this.mergeConflictChoices = new Map();
    } finally {
      this.mergePreviewLoading = false;
    }
  },

  /**
   * Re-roll the preview (regenerate).
   * @returns {Promise<void>}
   */
  async rerollPreview() {
    await this.loadPreview(true,);
  },

  /**
   * Set a conflict resolution for a hunk.
   * @param hunkIndex
   * @param resolution
   * @returns {void}
   */
  setConflictChoice(hunkIndex: number, resolution: "base" | "overlay" | "manual",) {
    this.mergeConflictChoices.set(hunkIndex, resolution,);
  },

  /**
   * Check if all conflicts are resolved.
   * @returns {boolean}
   */
  conflictsResolved(): boolean {
    const preview = this.mergePreview;
    if (!preview || preview.kind !== "overlay" || !preview.hunks) { return true; }
    return preview.hunks.every((h, i,) => h.status !== "conflict" || this.mergeConflictChoices.has(i,));
  },

  /**
   * Check if confirm is allowed.
   * @returns {boolean}
   */
  canConfirm(): boolean {
    if (!this.mergeId || !this.mergeMode) { return false; }
    if (this.mergePreviewLoading) { return false; }
    const preview = this.mergePreview;
    if (!preview) { return false; }
    if (preview.kind === "overlay") {
      return this.conflictsResolved();
    }

    // LLM mode: need at least one draft message
    return this.mergeDraftEdits.length > 0;
  },

  /**
   * Confirm the merge.
   * @param branchName
   * @param activate
   * @returns {Promise<void>}
   */
  async confirmMerge(branchName: string, activate: boolean,) {
    const mergeId = this.mergeId;
    if (!mergeId) { return; }
    this.mergeError = null;
    const preview = this.mergePreview;
    const content = preview?.kind === "llm" && this.mergeDraftEdits.length > 0
      ? this.mergeDraftEdits.map((m,) => ({ role: m.role, content: m.content, }))
      : undefined;

    const conflictChoices = preview?.kind === "overlay" && this.mergeConflictChoices.size > 0
      ? Array.from(this.mergeConflictChoices.entries(),).map(([hunkIndex, resolution,],) => ({
        hunkIndex,
        resolution,
      }))
      : undefined;

    const result = await confirmMergeApi(this, { mergeId, branchName, activate, content, conflictChoices, },);
    if (!result) { return; }
    this.$dispatch?.("show-toast", { type: "success", message: t("branches.merged",), },);
    await this.loadBranches();
    await this.loadMessages();
    this.closeBranchMerge();
  },

  /**
   * Continue from the merged tip.
   * @param prompt
   * @returns {Promise<void>}
   */
  async continueFromMerge(prompt?: string,) {
    const mergeId = this.mergeId;
    if (!mergeId) { return; }
    this.mergeError = null;
    const result = await continueFromMergeApi(this, { mergeId, prompt, },);
    if (!result) { return; }
    await this.loadMessages();
    this.closeBranchMerge();
  },

  /**
   * Reorder a source (move up or down).
   * @param index
   * @param direction
   * @returns {void}
   */
  reorderSource(index: number, direction: -1 | 1,) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= this.mergeSources.length) { return; }
    const sources = [...this.mergeSources,];
    const [moved,] = sources.splice(index, 1,);
    if (!moved) { return; }
    sources.splice(newIndex, 0, moved,);
    this.mergeSources = sources;
  },

  /**
   * Remove a source from the list.
   * @param index
   * @returns {void}
   */
  removeSource(index: number,) {
    if (index < 0 || index >= this.mergeSources.length) { return; }
    this.mergeSources = this.mergeSources.filter((_, i,) => i !== index);
  },

  /**
   * Get the default branch name.
   * @returns {string}
   */
  defaultBranchName(): string {
    return `Merged ${this.mergeSources.length}`;
  },
};

/** Expose global helpers for the merge wizard (outside chatState scope). */
const g = globalThis as Record<string, unknown>;
g.openBranchMerge = async function(sources?: MergeSourceTip[],) {
  await awaitChatStateAction("openBranchMerge", sources,);
};

g.closeBranchMerge = function() {
  callChatStateAction("closeBranchMerge",);
};

g.confirmMerge = async function(branchName: string, activate: boolean,) {
  await awaitChatStateAction("confirmMerge", branchName, activate,);
};

g.continueFromMerge = async function(prompt?: string,) {
  await awaitChatStateAction("continueFromMerge", prompt,);
};
