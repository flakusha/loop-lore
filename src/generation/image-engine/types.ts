// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { LoRAConfig, } from "../../generation/lora/types";
/**
 * Reference image for the ComfyUI `img2img` workflow. ComfyUI-path-only —
 * other providers ignore it. The caller resolves and authorizes the owning
 * asset and supplies its bytes; the upload filename is derived from assetId
 * so a caller can never steer the ComfyUI input path.
 */
export interface InitImage {
  /** Owning asset id — source of the server-derived upload filename. */
  assetId: string;
  /** Authorized asset bytes to upload as the LoadImage source. */
  buffer: Buffer;
}
/** */
export interface ImageGenOptions {
  prompt: string;
  n: number;
  /** openai `size`, defaults to `widthxheight`. */
  size?: string;
  /** Requested output size; each falls back to the provider config default. */
  width?: number;
  height?: number;
  /** ComfyUI scheduler axis, independent of the sampler. */
  scheduler?: string;
  /** "png" | "jpeg". */
  outputFormat: string;
  steps?: number;
  cfgScale?: number;
  samplerName?: string;
  negativePrompt?: string;
  seed?: number;
  enableHr?: boolean;
  hrScale?: number;
  /** ComfyUI denoise widget; the HTTP boundary's `denoising_strength` aliases this. */
  denoise?: number;
  /** ComfyUI workflow name (defaults to "txt2img"). */
  workflow?: string;
  /** Optional LoRA model to inject into the generation pipeline. */
  lora?: LoRAConfig;
  /** Picked model roles; fall back to the provider's config pins. */
  model?: string;
  clip?: string;
  vae?: string;
  clipVision?: string;
  /** Optional ComfyUI init/reference image for the img2img workflow. */
  initImage?: InitImage;
  /** BYO API key for this request (resolved user key). When set it overrides
   * the server-configured key on transports that send auth (openai, sdapi,
   * sd.cpp, comfyui Bearer seam). */
  apiKey?: string;
}

/** Success carries the generated images and their mime type. */
export interface ImageGenSuccess {
  ok: true;
  images: Buffer[];
  mimeType: string;
}

/** Failure carries a human error and the HTTP status to report. */
export interface ImageGenFailure {
  ok: false;
  error: string;
  status: number;
  /** Per-candidate record from the failover loop — why each candidate was
   * skipped (discovery gate) or failed. Absent on a direct provider dispatch. */
  attempts?: readonly FailoverAttempt[];
}

/** One failover candidate that was skipped or failed, with the structured reason. */
export interface FailoverAttempt {
  /** Provider instance name. */
  readonly provider: string;
  /** "skipped" = discovery gate refused before any generation attempt; "failed" = attempted. */
  readonly outcome: "skipped" | "failed";
  /** Structured skip/failure reason. */
  readonly reason: string;
  /** HTTP-ish status when one applies. */
  readonly status?: number;
}

/** */
export type ImageGenOutcome = ImageGenSuccess | ImageGenFailure;
