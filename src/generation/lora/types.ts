// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LoRA Types
 *
 * Type definitions for LoRA (Low-Rank Adaptation) discovery and application.
 * LoRA enables character-specific and style-specific visual consistency
 * across Stable Diffusion generations.
 * @module generation/lora/types
 */

// ── LoRA Configuration ──────────────────────────────────

/**
 * LoRA configuration for a single LoRA model.
 * name - Model filename without extension (e.g., "my_character")
 * strength - Application strength 0.1-1.0 (typical: 0.3-0.7)
 * backend - Target backend for application
 */
export interface LoRAConfig {
  name: string;
  strength: number;
  backend: "comfyui" | "sd-server";
}

/**
 * LoRA model metadata from discovery.
 * name - Model display name
 * filename - Original filename with extension
 * path - Full path to model file
 * backend - Backend this model is available on
 * size - File size in bytes (if available)
 * triggerWords - Trigger words from metadata (if available)
 * recommendedStrength - Recommended strength from metadata (if available)
 */
export interface LoRAModel {
  name: string;
  filename: string;
  path: string;
  backend: "comfyui" | "sd-server";
  size?: number;
  triggerWords?: string[];
  recommendedStrength?: number;
}

/**
 * LoRA discovery result.
 * models - Available LoRA models
 * backend - Backend that was queried
 * timestamp - Discovery timestamp
 * error - Error message if discovery failed
 */
export interface LoRADiscoveryResult {
  models: LoRAModel[];
  backend: "comfyui" | "sd-server";
  timestamp: number;
  error?: string;
}

/**
 * LoRA application context for workflow modification.
 * config - LoRA configuration to apply
 * nodeId - ComfyUI node ID for LoraLoader (ComfyUI only)
 * promptPrefix - sd.cpp prompt prefix (sd-server only)
 */
export interface LoRAApplicationContext {
  config: LoRAConfig;
  nodeId?: string;
  promptPrefix?: string;
}

// ── Validation Constants ─────────────────────────────────

/** Minimum LoRA strength value */
export const LORA_STRENGTH_MIN = 0.1;

/** Maximum LoRA strength value */
export const LORA_STRENGTH_MAX = 1;

/** Default LoRA strength */
// TODO: Use when LoRA is integrated into image generation pipeline
export const LORA_STRENGTH_DEFAULT = 0.5;

/** Typical LoRA strength range (recommended) */
// TODO: Use in UI to show recommended strength range
export const LORA_STRENGTH_TYPICAL_MIN = 0.3;
export const LORA_STRENGTH_TYPICAL_MAX = 0.7;

/** Common LoRA file extensions */
export const LORA_EXTENSIONS = [".safetensors", ".pt", ".ckpt", ".bin",];

/** LoRA file size limit (1GB) */
// TODO: Use in upload validation when LoRA upload is implemented
export const LORA_MAX_SIZE_BYTES = 1024 * 1024 * 1024;
