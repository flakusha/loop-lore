// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LoRA Module
 *
 * LoRA (Low-Rank Adaptation) discovery and application for Stable Diffusion.
 * Enables character-specific and style-specific visual consistency.
 * @module generation/lora
 */

// Types
export type {
  LoRAApplicationContext,
  LoRAConfig,
  LoRADiscoveryResult,
  LoRAModel,
} from "./types";

export {
  LORA_EXTENSIONS,
  LORA_MAX_SIZE_BYTES,
  LORA_STRENGTH_DEFAULT,
  LORA_STRENGTH_MAX,
  LORA_STRENGTH_MIN,
  LORA_STRENGTH_TYPICAL_MAX,
  LORA_STRENGTH_TYPICAL_MIN,
} from "./types";

// Validation
export {
  clampStrength,
  extractLoRAName,
  isLoRAFilename,
  isTypicalStrength,
  validateLoRAConfig,
  validateLoRAModel,
} from "./validation";

// Discovery
export {
  clearDiscoveryCache,
  discoverAllLoras,
  discoverLoras,
  getCachedLoras,
  getCacheStatus,
} from "./discovery";

// Backend-specific discovery
export { buildComfyUILoraNode, discoverComfyUILoras, injectComfyUILora, } from "./discovery-comfyui";
export { buildSdCppLoraPrefix, discoverSdCppLoras, injectSdCppLora, } from "./discovery-sdserver";
