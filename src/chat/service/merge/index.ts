// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Public API of the content-merge module (FEA-2026-047).
 */
export {
  confirmMerge,
  type ConfirmMergeOptions,
  type ConfirmMergeResult,
  MergeTxAbort,
} from "./merge-confirm";
export {
  continueFromMerge,
  type ContinueFromMergeOptions,
  type ContinueFromMergeResult,
} from "./merge-continue";
export {
  baseOrdinal,
  isMergeMode,
  MERGE_MODES,
  type MergeConflictChoice,
  type MergeDraftMessage,
  type MergeError,
  MergeMode,
  type MergePreviewRequest,
  type MergeStatus,
  modeInstruction,
  overlayOrdinal,
  previewRequestFor,
} from "./merge-criteria";
export {
  type ChangeBlock,
  changeBlocks,
  diffLines,
  type DiffOp,
  type MergeHunk,
} from "./merge-diff";
export {
  lowestCommonAncestor,
  MAX_MERGE_NODES,
  type MergeGraph,
  type MergeSource,
  type MergeSourceTip,
  resolveMergeGraph,
  type ResolveMergeGraphResult,
} from "./merge-graph";
export {
  buildMergePromptMessages,
  MERGE_SYSTEM_PROMPT_FALLBACK,
  parseMergeDraft,
  planMergeBudget,
  resolveMergeSystemPrompt,
  truncateLines,
} from "./merge-llm";
export {
  applyHunks,
  changedLineRatio,
  threeWayOverlay,
} from "./merge-overlay";
export {
  buildPreview,
  type BuildPreviewOptions,
  type BuildPreviewResult,
} from "./merge-preview";
export { insertResultRows, } from "./merge-result-rows";
export {
  initiateMerge,
  type InitiateMergeOptions,
  type InitiateMergeResult,
} from "./merge-service";
export {
  finalizeMergeRow,
  guardDraftToConfirmed,
  insertMergeRow,
  insertSourceRows,
  listSources,
  loadMerge,
  loadMergeByIdempotencyKey,
  type MergeMetadata,
  type MergeRecord,
  type MergeSourceRow,
  updateMergeMetadata,
} from "./merge-store";
