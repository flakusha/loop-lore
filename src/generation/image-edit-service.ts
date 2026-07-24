/**
 * Image Edit Service
 *
 * Manages image editing operations with undo/redo support.
 * Integrates with the generation pipeline for img2img operations.
 *
 * @module generation/image-edit-service
 */

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { createAsset, getAsset, linkAsset, } from "../assets/service";
import { loadConfig, } from "../config/load";
import { pickSdProvider, } from "../config/schema";
import { AssetLinkEntity, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonStringifyOr, } from "../utils";
import { validateProviderUrl, } from "../utils/url-validation";
import type {
  EditChainEntry,
  EditHistory,
  EditTemplate,
  ParsedCommand,
} from "./image-edit-commands";
import { getTemplateById, parseEditCommand, } from "./image-edit-commands";

/** Service options */
export interface ImageEditServiceOpts {
  database?: Kysely<DB>;
  uploadDir?: string;
}

/** Edit request */
export interface EditImageRequest {
  /** Source asset ID to edit */
  sourceAssetId: string;
  /** User command text */
  command: string;
  /** Actor ID for ownership */
  actorId: string;
  /** Optional template ID override */
  templateId?: string;
  /** Optional custom denoising strength */
  denoisingStrength?: number;
}

/** Edit result */
export interface EditResult {
  success: boolean;
  editEntryId?: string;
  resultAssetId?: string;
  command?: ParsedCommand;
  error?: string;
}

/** Undo/Redo result */
export interface UndoRedoResult {
  success: boolean;
  assetId?: string;
  entryId?: string;
  error?: string;
}

/** In-memory edit histories (persists until server restart) */
const editHistories = new Map<string, EditHistory>();

/**
 * Image Edit Service
 *
 * Manages image editing with undo/redo support.
 */
export class ImageEditService {
  private readonly db: Kysely<DB>;
  private readonly uploadDir: string;

  constructor(opts: ImageEditServiceOpts = {},) {
    if (!opts.database) {
      throw new Error("ImageEditService requires a database instance",);
    }
    this.db = opts.database;
    const config = loadConfig();
    this.uploadDir = opts.uploadDir ?? config.assets.uploadDir;
  }

  /**
   * Edit an image based on a natural language command.
   *
   * @param request - Edit request
   * @returns Edit result with new asset ID
   */
  async editImage(request: EditImageRequest,): Promise<EditResult> {
    const { sourceAssetId, command, actorId, templateId, denoisingStrength, } = request;

    // Verify source asset exists
    const sourceAsset = await getAsset(this.db, sourceAssetId,);
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
      const resultAssetId = await this.applyEdit({
        sourceAssetId,
        template,
        denoisingStrength: effectiveDenoising,
        parsed,
        actorId,
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

  /**
   * Undo the last edit on an asset.
   *
   * @param assetId - Asset ID to undo edit for
   * @returns Undo result with restored asset ID
   */
  async undoEdit(assetId: string,): Promise<UndoRedoResult> {
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

  /**
   * Redo a previously undone edit.
   *
   * @param assetId - Asset ID to redo edit for
   * @returns Redo result with applied asset ID
   */
  async redoEdit(assetId: string,): Promise<UndoRedoResult> {
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

      const resultAssetId = await this.applyEdit({
        sourceAssetId,
        template,
        denoisingStrength: template.denoisingStrength,
        parsed: entry.command,
        actorId: "", // Will be resolved from asset
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

  /**
   * Get edit history for an asset.
   *
   * @param assetId - Asset ID
   * @returns Edit history or undefined
   */
  getEditHistory(assetId: string,): EditHistory | undefined {
    return editHistories.get(assetId,);
  }

  /**
   * Clear edit history for an asset.
   *
   * @param assetId - Asset ID
   */
  clearEditHistory(assetId: string,): void {
    editHistories.delete(assetId,);
  }

  /**
   * Apply an edit using the generation pipeline.
   */
  private async applyEdit(opts: {
    sourceAssetId: string;
    template: EditTemplate;
    denoisingStrength: number;
    parsed: ParsedCommand;
    actorId: string;
  },): Promise<string> {
    const config = loadConfig();
    const sdConfig = pickSdProvider(config.generation.providers.sd, "edit",);

    if (!sdConfig) {
      throw new Error("No image generation provider configured",);
    }

    const validated = validateProviderUrl(sdConfig.baseUrl,);
    if (!validated.ok) {
      throw new Error(`Invalid image provider URL: ${validated.error}`,);
    }

    // Build img2img request
    const prompt = opts.template.promptModifier;
    const negativePrompt = opts.template.negativePrompt ?? "";

    let resultImages: Buffer[];
    const mimeType = "image/png";

    switch (sdConfig.apiFamily) {
      case "sdapi": {
        const url = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/sdapi/v1/img2img`;

        // Get source image as base64
        const sourceAsset = await getAsset(this.db, opts.sourceAssetId,);
        if (!sourceAsset) {
          throw new Error("Source asset not found",);
        }

        // Read the file and convert to base64
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const filePath = path.join(
          config.assets.uploadDir,
          sourceAsset.storage_path,
        );
        const imageBuffer = await fs.readFile(filePath,);
        const base64Image = imageBuffer.toString("base64",);

        const payload = jsonStringifyOr({
          init_images: [base64Image,],
          prompt,
          negative_prompt: negativePrompt,
          denoising_strength: opts.denoisingStrength,
          steps: opts.template.steps ?? sdConfig.defaults.steps,
          cfg_scale: opts.template.cfgScale ?? sdConfig.defaults.cfgScale,
          sampler_name: sdConfig.defaults.sampler,
          width: sdConfig.defaults.width,
          height: sdConfig.defaults.height,
        },);

        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: payload,
          signal: AbortSignal.timeout(sdConfig.generationTimeout ?? 120_000,),
        },);

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "unknown");
          throw new Error(`img2img generation failed: ${errText}`,);
        }

        const data = (await resp.json()) as { images: string[] };
        resultImages = data.images.map((b64,) => Buffer.from(b64, "base64",));
        break;
      }
      case "openai": {
        // OpenAI doesn't support img2img directly, use DALL-E for editing
        const url = `${sdConfig.baseUrl.replace(/\/+$/, "",)}/v1/images/edits`;

        const formData = new FormData();

        // Get source image
        const sourceAsset = await getAsset(this.db, opts.sourceAssetId,);
        if (!sourceAsset) {
          throw new Error("Source asset not found",);
        }

        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const filePath = path.join(
          config.assets.uploadDir,
          sourceAsset.storage_path,
        );
        const imageBlob = new Blob([await fs.readFile(filePath,),],);

        formData.append("image", imageBlob, "source.png",);
        formData.append("prompt", prompt,);
        formData.append("n", "1",);
        formData.append("size", `${sdConfig.defaults.width}x${sdConfig.defaults.height}`,);

        const headers: Record<string, string> = {};
        if (sdConfig.apiKey) {
          headers.Authorization = `Bearer ${sdConfig.apiKey}`;
        }

        const resp = await fetch(url, {
          method: "POST",
          headers,
          body: formData,
          signal: AbortSignal.timeout(sdConfig.generationTimeout ?? 60_000,),
        },);

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "unknown");
          throw new Error(`Image edit failed: ${errText}`,);
        }

        const data = (await resp.json()) as { data: { b64_json: string }[] };
        resultImages = data.data.map((d,) => Buffer.from(d.b64_json, "base64",));
        break;
      }
      default: {
        throw new Error(
          `Image gen API family "${sdConfig.apiFamily}" not supported for img2img. Use "sdapi" or "openai".`,
        );
      }
    }

    // Store result as asset
    const db = this.db;
    let resultAssetId = "";

    for (const buffer of resultImages) {
      const id = randomUUID();
      const filename = `edit-${id.slice(0, 8,)}.png`;

      const asset = await createAsset({
        database: db,
        input: {
          ownerId: opts.actorId,
          filename,
          mimeType,
          assetType: "image",
          sizeBytes: buffer.length,
          buffer,
          altText: `Edited: ${opts.parsed.intent}`,
        },
        uploadDir: this.uploadDir,
      },);

      resultAssetId = asset.id;

      // Link to source asset
      await linkAsset({
        database: db,
        assetId: asset.id,
        link: {
          entityType: AssetLinkEntity.Actor,
          entityId: opts.sourceAssetId,
          label: `edit:${opts.parsed.intent}`,
        },
      },);
    }

    return resultAssetId;
  }
}
