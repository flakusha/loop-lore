// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * sd-server Image Edit Provider — Executes templates via sd-server API
 *
 * Translates workflow templates to sd-server API calls (txt2img, img2img).
 * sd-server uses OpenAI-compatible, SDAPI, or sd.cpp API families.
 * @module sd-server-provider
 *
 * The concrete operation bodies live in sibling dispatcher modules (ops /
 * families) threaded with an explicit `SDServerHost` handle. The class is kept
 * so callers can `new SDServerEditProvider()`.
 */
import { loadConfig, } from "../../../config/load";
import {
  type ImageProviderConfig,
  pickSdProvider,
} from "../../../config/schema";
import type { ImageApiFamily, } from "../../../db/enums-config";
import { getLogger, } from "../../../logger";
import { safeFetch, } from "../../../utils";
import { validateProviderUrl, } from "../../../utils/url-validation";
import type {
  ImageEditBackend,
  ImageEditCategory,
  ImageEditProgress,
  ImageEditProvider,
  ImageEditRequest,
  ImageEditResult,
  SDServerCapabilities,
  WorkflowTemplate,
} from "../../types";
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
  async listCapabilities(): Promise<ImageEditCategory[]> {
    const caps: ImageEditCategory[] = ["txt2img", "img2img",];

    const cfg = this.getConfig();
    if (cfg) {
      // ControlNet available if configured
      if ("controlNetPath" in cfg && cfg.controlNetPath) {
        caps.push("controlnet",);
      }
      // Upscale available if upscaler models configured
      if ("hiresUpscalersDir" in cfg && cfg.hiresUpscalersDir) {
        caps.push("upscale",);
      }
    }

    return caps;
  }

  /** */
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
   * @param onProgress
   */
  async execute(
    request: ImageEditRequest,
    template: WorkflowTemplate,
    onProgress?: (progress: ImageEditProgress,) => void,
  ): Promise<ImageEditResult[]> {
    const cfg = this.getConfig();
    if (!cfg || !this.baseUrl) {
      throw new Error("sd-server not configured. Set config.generation.providers.sd",);
    }

    onProgress?.({ status: "pending", message: "Building request...", },);

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
  }
}
