// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI Image Edit Provider — Executes templates via ComfyUI API
 *
 * Wraps the existing ComfyUIClient to run workflow templates,
 * download generated images, and store them as assets.
 * @module comfyui-provider
 */

import { extractImageMetadata, } from "../../assets/metadata";
import { createAsset, linkAsset, } from "../../assets/service";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import { pickSdProvider, } from "../../config/schema";
import { getDatabase, } from "../../db";
import { ComfyUIClient, } from "../../generation/providers/comfyui";
import { getLogger, } from "../../logger";
import type {
  ImageEditBackend,
  ImageEditCategory,
  ImageEditExecuteOpts,
  ImageEditProvider,
  ImageEditRequest,
  ImageEditResult,
  WorkflowTemplate,
} from "../types";

let _log: ReturnType<typeof getLogger> | null = null;
function log() {
  _log ??= getLogger();
  return _log;
}

/** Node class_type categories that indicate capability */
const CAPABILITY_NODE_MAP: Record<ImageEditCategory, string[]> = {
  txt2img: ["KSampler", "EmptyLatentImage",],
  img2img: ["VAEEncode",],
  inpaint: ["VAEEncodeForInpaint",],
  upscale: ["UpscaleModelLoader", "ImageUpscaleWithModel",],
  controlnet: ["ControlNetLoader", "ControlNetApply",],
};

export class ComfyUIEditProvider implements ImageEditProvider {
  readonly name: ImageEditBackend = "comfyui";

  private installedNodes: Set<string> | null = null;

  /**
   * Deliberately not memoized: a cached client is immune to `mock.module`, which
   * rebinds the export but cannot reach an already-built instance — and keying the
   * cache on baseUrl is no better, since it still serves a stale instance when the
   * config is unchanged but the client class is swapped.
   */
  private getClient(config?: Config,): ComfyUIClient {
    const sdConfig = pickSdProvider((config ?? loadConfig()).generation.providers.sd, "edit",);

    return new ComfyUIClient({
      baseUrl: sdConfig?.baseUrl ?? "http://127.0.0.1:8188",
      timeout: sdConfig?.generationTimeout ?? 120_000,
      pollIntervalMs: 500,
    },);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.getNodeInfo();
      return true;
    } catch {
      return false;
    }
  }

  async listCapabilities(): Promise<ImageEditCategory[]> {
    const nodes = await this.getInstalledNodes();
    const capabilities: ImageEditCategory[] = [];

    for (const [category, requiredNodeTypes,] of Object.entries(CAPABILITY_NODE_MAP,)) {
      const hasCapability = requiredNodeTypes.some((nodeType,) => nodes.has(nodeType,));
      if (hasCapability) {
        capabilities.push(category as ImageEditCategory,);
      }
    }

    return capabilities;
  }

  async getInstalledNodes(): Promise<Set<string>> {
    if (this.installedNodes) { return this.installedNodes; }

    try {
      const client = this.getClient();
      const nodeInfo = await client.getNodeInfo();
      this.installedNodes = new Set(Object.keys(nodeInfo,),);
      return this.installedNodes;
    } catch (error) {
      log().error({ message: "Failed to discover ComfyUI nodes", error: String(error,), },);
      this.installedNodes = new Set();
      return this.installedNodes;
    }
  }

  async getNodeInfo() {
    const client = this.getClient();
    return client.getNodeInfo();
  }

  /** Force re-discovery of nodes */
  /**
   * @returns {void}
   */
  refreshNodes(): void {
    this.installedNodes = null;
  }

  /**
   * @param request
   * @param template
   * @param opts
   * @throws {Error}
   */
  async execute(
    request: ImageEditRequest,
    template: WorkflowTemplate,
    opts: ImageEditExecuteOpts,
  ): Promise<ImageEditResult[]> {
    const onProgress = opts.onProgress;
    // One `loadConfig()` for both the client and the upload dir below.
    const config = loadConfig();
    const client = this.getClient(config,);

    onProgress?.({ status: "pending", message: "Building workflow...", },);

    // Inject emotion parameter into template params if provided
    const params = { ...request.params, };
    if (params.emotion) {
      params.emotion_modifier = this.getEmotionModifier(params.emotion as string,);
    }

    const workflow = template.build(params,);

    onProgress?.({ status: "running", message: "Submitting to ComfyUI...", },);

    const { prompt_id, } = await client.submitWorkflow(workflow,);

    onProgress?.({ status: "running", progress: 0, message: "Executing workflow...", },);

    const filenames = await client.waitForCompletion(prompt_id, 120_000,);

    onProgress?.({ status: "running", progress: 0.9, message: "Downloading images...", },);

    const database = getDatabase();
    const uploadDir = config.assets.uploadDir;
    const results: ImageEditResult[] = [];

    for (const filename of filenames) {
      const buffer = await client.downloadImage(filename,);
      const ext = filename.split(".",).pop() ?? "png";
      const meta = extractImageMetadata(buffer,);

      const { asset, } = await createAsset({
        database,
        input: {
          ownerId: opts.ownerId,
          filename,
          mimeType: `image/${ext === "jpg" ? "jpeg" : ext}`,
          assetType: "image",
          sizeBytes: buffer.length,
          buffer,
          altText: `ComfyUI ${template.name}: ${meta.width}x${meta.height} ${meta.format}`,
          // Each ComfyUI run is a new item. Without this, a run that returns
          // bytes matching an earlier one collapses onto that row and inherits
          // its id, visibility and shares.
          dedupe: false,
        },
        uploadDir,
      },);

      if (request.chatId) {
        await linkAsset({
          database,
          assetId: asset.id,
          link: { entityType: "chat", entityId: request.chatId, label: template.name, },
        },);
      }
      if (request.messageId) {
        await linkAsset({
          database,
          assetId: asset.id,
          link: { entityType: "message", entityId: request.messageId, label: template.name, },
        },);
      }

      results.push({
        id: asset.id,
        filename: asset.filename,
        url: `/api/assets/${asset.id}/raw`,
        mimeType: asset.mime_type,
      },);
    }

    onProgress?.({ status: "completed", progress: 1, },);

    log().info({
      message: "ComfyUI execution completed",
      prompt_id,
      images: results.length,
    },);

    return results;
  }

  /**
   * Get emotion-based prompt modifier for ComfyUI workflow.
   * Maps emotion types to descriptive prompt suffixes for conditioning nodes.
   * @param emotion
   */
  private getEmotionModifier(emotion: string,): string {
    const modifiers: Record<string, string> = {
      happy: "happy expression, smiling, bright eyes, cheerful",
      sad: "sad expression, downcast eyes, melancholy, sorrowful",
      angry: "angry expression, furrowed brow, intense gaze, furious",
      fearful: "fearful expression, wide eyes, trembling, scared",
      surprised: "surprised expression, raised eyebrows, wide eyes, astonished",
      disgusted: "disgusted expression, wrinkled nose, repulsed",
      neutral: "neutral expression, calm face, natural look",
      excited: "excited expression, enthusiastic, eager, thrilled",
      anxious: "anxious expression, worried brow, nervous, tense",
      calm: "calm expression, serene face, peaceful, composed",
      confused: "confused expression, tilted head, puzzled, bewildered",
      proud: "proud expression, confident, chin up, dignified",
      shameful: "shameful expression, looking away, embarrassed, guilty",
      loving: "loving expression, warm gaze, tender, affectionate",
      jealous: "jealous expression, envious, bitter, resentful",
      grateful: "grateful expression, thankful, appreciative, warm",
      bored: "bored expression, disinterested, vacant stare, apathetic",
      contemptuous: "contemptuous expression, sneering, disdainful look",
    };
    return modifiers[emotion] ?? "";
  }
}
