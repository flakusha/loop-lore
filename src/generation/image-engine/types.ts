// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { LoRAConfig, } from "../../generation/lora/types";
/** */
export interface ImageGenOptions {
  prompt: string;
  n: number;
  /** openai `size`, defaults to `widthxheight`. */
  size?: string;
  /** "png" | "jpeg". */
  outputFormat: string;
  steps?: number;
  cfgScale?: number;
  samplerName?: string;
  negativePrompt?: string;
  seed?: number;
  enableHr?: boolean;
  hrScale?: number;
  denoisingStrength?: number;
  /** ComfyUI workflow name (defaults to "txt2img"). */
  workflow?: string;
  /** Optional LoRA model to inject into the generation pipeline. */
  lora?: LoRAConfig;
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
}

/** */
export type ImageGenOutcome = ImageGenSuccess | ImageGenFailure;
