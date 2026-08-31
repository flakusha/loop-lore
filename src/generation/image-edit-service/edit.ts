// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Edit dispatcher ──────────────────────────────────────

import { randomUUID, } from "node:crypto";
import { getAsset, } from "../../assets/service";
import { getLogger, } from "../../logger";
import { getTemplateById, parseEditCommand, } from "../image-edit-commands";
import type { EditChainEntry, } from "../image-edit-commands";
import { applyEdit, } from "./apply";
import { editHistories, } from "./state";
import type { EditImageRequest, EditResult, ImageEditServiceContext, } from "./types";

/** */
export interface EditImageArgs {
  thisL: ImageEditServiceContext;
  request: EditImageRequest;
}

/**
 * Edit an image based on a natural language command.
 * @param args.thisL - The image edit service instance
 * @param root0
 * @param root0.thisL
 * @param args.request - Edit request
 * @param root0.request
 * @returns Edit result with new asset ID
 */
export async function editImage(
  { thisL, request, }: EditImageArgs,
): Promise<EditResult> {
  const { sourceAssetId, command, actorId, templateId, denoisingStrength, } = request;

  // Verify source asset exists
  const sourceAsset = await getAsset(thisL.db, sourceAssetId,);
  if (!sourceAsset) {
    return { success: false, error: `Asset ${sourceAssetId} not found`, };
  }

  // Parse command
  const parsed = parseEditCommand(command,);

  // Get template (explicit or from parsed command)
  const template = templateId
    ? getTemplateById(templateId,)
    : parsed.template;

  if (!template) {
    return {
      success: false,
      command: parsed,
      error: `No template found for command: ${command}`,
    };
  }

  // Apply denoising strength override
  const effectiveDenoising = denoisingStrength ?? template.denoisingStrength;

  // Create edit chain entry
  const entryId = randomUUID();
  const editEntry: EditChainEntry = {
    id: entryId,
    command: parsed,
    assetId: sourceAssetId,
    timestamp: new Date().toISOString(),
    status: "pending",
  };

  // Get or create edit history
  let history = editHistories.get(sourceAssetId,);
  if (!history) {
    history = {
      assetId: sourceAssetId,
      entries: [],
      currentEntryIndex: -1,
    };
    editHistories.set(sourceAssetId, history,);
  }

  // Add entry to history
  history.entries.push(editEntry,);
  history.currentEntryIndex = history.entries.length - 1;

  try {
    // Perform the edit
    const resultAssetId = await applyEdit({
      thisL,
      opts: {
        sourceAssetId,
        template,
        denoisingStrength: effectiveDenoising,
        parsed,
        actorId,
      },
    },);

    // Update entry
    editEntry.resultAssetId = resultAssetId;
    editEntry.status = "applied";

    return {
      success: true,
      editEntryId: entryId,
      resultAssetId,
      command: parsed,
    };
  } catch (error) {
    editEntry.status = "failed";
    editEntry.error = String(error,);

    getLogger().error(
      "Image edit failed",
      error instanceof Error ? error : new Error(String(error,),),
      { entryId, sourceAssetId, template: template.id, },
    );

    return {
      success: false,
      editEntryId: entryId,
      command: parsed,
      error: String(error,),
    };
  }
}
