// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * SD-server Image Edit Provider — Executes templates via sd-server API
 *
 * Translates workflow templates to sd-server API calls (txt2img, img2img).
 * sd-server uses OpenAI-compatible, SDAPI, or sd.cpp API families.
 * @module sd-server-provider
 *
 * The concrete operation bodies live in sibling dispatcher modules (ops /
 * families) threaded with an explicit `SDServerHost` handle. The class is kept
 * so callers can `new SDServerEditProvider()`.
 */
import { extractImageMetadata, } from "../../../assets/metadata";
import { createAsset, linkAsset, } from "../../../assets/service";
import { loadConfig, } from "../../../config/load";
import {
  type ImageProviderConfig,
  pickSdProvider,
} from "../../../config/schema";
import { getDatabase, } from "../../../db";
import type { ImageApiFamily, } from "../../../db/enums-config";
import { getLogger, } from "../../../logger";
import { safeFetch, } from "../../../utils";
import { mustFromBase64, } from "../../../utils/safe-buffer";
import { validateProviderUrl, } from "../../../utils/url-validation";
import type {
  ImageEditBackend,
  ImageEditCategory,
  ImageEditExecuteOpts,
  ImageEditProvider,
  ImageEditRequest,
  ImageEditResult,
  SDServerCapabilities,
  WorkflowTemplate,
} from "../../types";
import type { SdServerRawImage, } from "./families";
import {
  executeImg2Img as executeImg2ImgDispatch,
  executeTxt2Img as executeTxt2ImgDispatch,
  executeUpscale as executeUpscaleDispatch,
} from "./ops";
import type { SDServerHost, } from "./types";

let _log: ReturnType<typeof getLogger> | null = null;
/** */
function log() {
  _log ??= getLogger();
  return _log;
}

/** */
export class SDServerEditProvider implements ImageEditProvider, SDServerHost {
  readonly name: ImageEditBackend = "sd-server";

  baseUrl: string | null = null;
  apiFamily: ImageApiFamily = "sdcpp";
  private config: ImageProviderConfig | null = null;

  /** */
  /**
   * @returns {ImageProviderConfig | null}
   */
  getConfig(): ImageProviderConfig | null {
    if (this.config) { return this.config; }

    const appConfig = loadConfig();
    const sdConfig = pickSdProvider(appConfig.generation.providers.sd, "edit",);
    if (!sdConfig) { return null; }

    const validated = validateProviderUrl(sdConfig.baseUrl,);
    if (!validated.ok) {
      log().warn({ message: "Invalid sd-server URL", error: validated.error, },);
      return null;
    }

    this.baseUrl = sdConfig.baseUrl.replace(/\/+$/, "",);
    this.apiFamily = sdConfig.apiFamily ?? "sdcpp";
    this.config = sdConfig;
    return sdConfig;
  }

  /** */
  /**
   * @returns {Promise<boolean>}
   */
  async healthCheck(): Promise<boolean> {
    try {
      const cfg = this.getConfig();
      if (!cfg || !this.baseUrl) { return false; }

      const result = await safeFetch<string>(this.baseUrl, {
        timeout: 5_000,
        handle401: false,
        parseJson: false,
      },);

      return result.ok;
    } catch {
      return false;
    }
  }

  /** */
  /**
   * @returns {Promise<ImageEditCategory[]>}
   */
  async listCapabilities(): Promise<ImageEditCategory[]> {
    const caps: ImageEditCategory[] = ["txt2img", "img2img",];

    const sdCpp = loadConfig().generation.autoStart?.sdCpp;
    if (sdCpp) {
      // ControlNet available if configured
      if (sdCpp.controlNetPath) {
        caps.push("controlnet",);
      }

      // Upscale available if upscaler models configured
      if (sdCpp.hiresUpscalersDir) {
        caps.push("upscale",);
      }
    }

    return caps;
  }

  /** */
  /**
   * @returns {Promise<SDServerCapabilities>}
   */
  async getCapabilities(): Promise<SDServerCapabilities> {
    const features = await this.listCapabilities();
    return {
      apiFamily: this.apiFamily,
      features,
      models: [],
    };
  }

  /**
   * @param request
   * @param template
   * @param opts
   * @returns the rendered images for this request
   * @throws {Error} when sd-server is unconfigured, the category is unknown, or the dispatch fails
   */
  async execute(
    request: ImageEditRequest,
    template: WorkflowTemplate,
    opts: ImageEditExecuteOpts,
  ): Promise<ImageEditResult[]> {
    const onProgress = opts.onProgress;
    const cfg = this.getConfig();
    if (!cfg || !this.baseUrl) {
      throw new Error("sd-server not configured. Set config.generation.providers.sd",);
    }

    onProgress?.({ status: "pending", message: "Building request...", },);

    // Families return raw wire images; THIS method owns persistence (same
    // contract as the ComfyUI provider): every returned URL resolves to a
    // real asset row created BEFORE the run reports completion.
    const config = loadConfig();
    const database = getDatabase();
    const uploadDir = config.assets.uploadDir;

    const dispatch = (): Promise<SdServerRawImage[]> => {
      switch (template.category) {
        case "txt2img": {
          return executeTxt2ImgDispatch(this, request.params, cfg, onProgress,);
        }

        case "img2img": {
          return executeImg2ImgDispatch(this, request.params, cfg, onProgress,);
        }

        case "upscale": {
          return executeUpscaleDispatch(this, request.params, onProgress,);
        }

        case "inpaint":
        case "controlnet": {
          throw new Error(`sd-server does not support category: ${template.category}`,);
        }
      }
    };

    const rawImages = await dispatch();

    onProgress?.({ status: "running", progress: 0.9, message: "Persisting images...", },);

    const results: ImageEditResult[] = [];
    for (const [i, raw,] of rawImages.entries()) {
      const buffer = mustFromBase64(raw.b64,);
      const ext = (raw.mimeType.split("/",)[1] ?? "png").toLowerCase();
      const meta = extractImageMetadata(buffer,);
      const filename = `sdserver-${template.id}-${Date.now()}-${i}.${ext === "jpeg" ? "jpg" : ext}`;

      const { asset, } = await createAsset({
        database,
        input: {
          ownerId: opts.ownerId,
          filename,
          mimeType: raw.mimeType,
          assetType: "image",
          sizeBytes: buffer.length,
          buffer,
          altText: `sd-server ${template.name}: ${meta.width}x${meta.height} ${meta.format}`,
          // Each sd-server run is a new item; identical bytes must not
          // collapse onto an earlier asset row (ComfyUI provider parity).
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
        url: `/api/v1/assets/${asset.id}/raw`,
        mimeType: asset.mime_type,
      },);
    }

    return results;
  }
}
