// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI Image Edit Provider — Executes templates via ComfyUI API
 *
 * Wraps the existing ComfyUIClient to run workflow templates,
 * download generated images, and store them as assets.
 *
 * @module comfyui-provider
 */

import { extractImageMetadata, } from "../../assets/metadata";
import { createAsset, linkAsset, } from "../../assets/service";
import { loadConfig, } from "../../config/load";
import { pickSdProvider, } from "../../config/schema";
import { getDatabase, } from "../../db";
import { ComfyUIClient, } from "../../generation/providers/comfyui";
import { getLogger, } from "../../logger";
import type {
  ImageEditBackend,
  ImageEditCategory,
  ImageEditProgress,
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

  private client: ComfyUIClient | null = null;
  private installedNodes: Set<string> | null = null;

  private getClient(): ComfyUIClient {
    if (!this.client) {
      const config = loadConfig();
      const sdConfig = pickSdProvider(config.generation.providers.sd, "edit",);
      const baseUrl = sdConfig?.baseUrl ?? "http://127.0.0.1:8188";

      this.client = new ComfyUIClient({
        baseUrl,
        timeout: sdConfig?.generationTimeout ?? 120_000,
        pollIntervalMs: 500,
      },);
    }
    return this.client;
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
  refreshNodes(): void {
    this.installedNodes = null;
  }

  async execute(
    request: ImageEditRequest,
    template: WorkflowTemplate,
    onProgress?: (progress: ImageEditProgress,) => void,
  ): Promise<ImageEditResult[]> {
    const client = this.getClient();

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
    const uploadDir = loadConfig().assets.uploadDir;
    const results: ImageEditResult[] = [];

    for (const filename of filenames) {
      const buffer = await client.downloadImage(filename,);
      const ext = filename.split(".",).pop() ?? "png";
      const meta = extractImageMetadata(buffer,);

      const { asset, } = await createAsset({
        database,
        input: {
          ownerId: "system",
          filename,
          mimeType: `image/${ext === "jpg" ? "jpeg" : ext}`,
          assetType: "image",
          sizeBytes: buffer.length,
          buffer,
          altText: `ComfyUI ${template.name}: ${meta.width}x${meta.height} ${meta.format}`,
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
