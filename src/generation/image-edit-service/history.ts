// ── Undo / redo / history dispatchers ───────────────────

import type { EditHistory, } from "../image-edit-commands";
import { applyEdit, } from "./apply";
import { editHistories, } from "./state";
import type { ImageEditServiceContext, UndoRedoResult, } from "./types";

export interface UndoEditArgs {
  thisL: ImageEditServiceContext;
  assetId: string;
}

/**
 * Undo the last edit on an asset.
 *
 * @param args.thisL - The image edit service instance
 * @param args.assetId - Asset ID to undo edit for
 * @returns Undo result with restored asset ID
 */
export async function undoEdit(
  { assetId, }: UndoEditArgs,
): Promise<UndoRedoResult> {
  const history = editHistories.get(assetId,);
  if (!history || history.currentEntryIndex < 0) {
    return { success: false, error: "No edits to undo", };
  }

  const currentEntry = history.entries[history.currentEntryIndex];
  if (currentEntry?.status !== "applied") {
    return { success: false, error: "Current edit not applied", };
  }

  // Mark current entry as undone
  currentEntry.status = "undone";

  // Move to previous entry
  history.currentEntryIndex--;

  // Get the asset to restore
  const restoredAssetId = history.currentEntryIndex >= 0
    ? history.entries[history.currentEntryIndex]?.resultAssetId ?? assetId
    : assetId;

  return {
    success: true,
    assetId: restoredAssetId,
    entryId: currentEntry.id,
  };
}

export interface RedoEditArgs {
  thisL: ImageEditServiceContext;
  assetId: string;
}

/**
 * Redo a previously undone edit.
 *
 * @param args.thisL - The image edit service instance
 * @param args.assetId - Asset ID to redo edit for
 * @returns Redo result with applied asset ID
 */
export async function redoEdit(
  { thisL, assetId, }: RedoEditArgs,
): Promise<UndoRedoResult> {
  const history = editHistories.get(assetId,);
  if (!history) {
    return { success: false, error: "No edit history found", };
  }

  // Check if there's an undone entry to redo
  const nextIndex = history.currentEntryIndex + 1;
  if (nextIndex >= history.entries.length) {
    return { success: false, error: "No edits to redo", };
  }

  const entry = history.entries[nextIndex];
  if (entry?.status !== "undone") {
    return { success: false, error: "Next entry is not undone", };
  }

  // Re-apply the edit
  try {
    const sourceAssetId = history.currentEntryIndex >= 0
      ? history.entries[history.currentEntryIndex]?.resultAssetId ?? assetId
      : assetId;

    const template = entry.command.template;
    if (!template) {
      return { success: false, error: "No template found for redo", };
    }

    const resultAssetId = await applyEdit({
      thisL,
      opts: {
        sourceAssetId,
        template,
        denoisingStrength: template.denoisingStrength,
        parsed: entry.command,
        actorId: "", // Will be resolved from asset
      },
    },);

    entry.resultAssetId = resultAssetId;
    entry.status = "applied";
    history.currentEntryIndex = nextIndex;

    return {
      success: true,
      assetId: resultAssetId,
      entryId: entry.id,
    };
  } catch (error) {
    entry.status = "failed";
    entry.error = String(error,);

    return {
      success: false,
      entryId: entry.id,
      error: String(error,),
    };
  }
}

export interface GetEditHistoryArgs {
  thisL: ImageEditServiceContext;
  assetId: string;
}

/**
 * Get edit history for an asset.
 *
 * @param args.thisL - The image edit service instance
 * @param args.assetId - Asset ID
 * @returns Edit history or undefined
 */
export function getEditHistory(
  { assetId, }: GetEditHistoryArgs,
): EditHistory | undefined {
  return editHistories.get(assetId,);
}

export interface ClearEditHistoryArgs {
  thisL: ImageEditServiceContext;
  assetId: string;
}

/**
 * Clear edit history for an asset.
 *
 * @param args.thisL - The image edit service instance
 * @param args.assetId - Asset ID
 */
export function clearEditHistory(
  { assetId, }: ClearEditHistoryArgs,
): void {
  editHistories.delete(assetId,);
}
