// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/auto-start.ts — Auto-start external-server config types
//
// Spawn external servers (llama.cpp, sd.cpp, llama-swap proxy) at startup.

import type { SdModelType, } from "../../db/enums";

/** */
export interface LlamaCppAutoStartConfig {
  /** Master toggle — false = external server expected */
  enabled: boolean;
  /** Path to GGUF model OR HuggingFace identifier (org/repo:quant) */
  modelPath: string;
  /** Port for llama-server (default: 9011) */
  port: number;

  // ── Model / hardware ───────────────────────────────────
  /** Model alias for API reference. Defaults to model filename. */
  alias?: string;
  /** Context size in tokens (default: 8192) */
  ctxSize?: number;
  /** Number of CPU threads (default: -1 = auto) */
  threads?: number;
  /** Max GPU layers to offload (number, "auto", or "all") */
  nGpuLayers?: string;
  /** Comma-separated GPU device list. Use --list-devices to see options. */
  device?: string;
  /** Force system to keep model in RAM */
  mlock?: boolean;

  // ── KV cache ───────────────────────────────────────────
  /** KV cache data type for K: f32, f16, bf16, q8_0, q4_0, iq4_nl, q5_0, q5_1 */
  cacheTypeK?: string;
  /** KV cache data type for V */
  cacheTypeV?: string;
  /** KV cache data type for K (draft): f32, f16, bf16, q8_0, q4_0, iq4_nl, q5_0, q5_1 */
  cacheTypeKD?: string;
  /** KV cache data type for V */
  cacheTypeVD?: string;
  /** KV cache RAM budget in MiB */
  cacheRam?: number;
  /** Flash attention: on, off, or auto (default: auto) */
  flashAttn?: string;
  /** Use full-size SWA cache */
  swaFull?: boolean;

  // ── Context scaling ────────────────────────────────────
  /** RoPE frequency scaling: none, linear, yarn */
  ropeScaling?: string;
  /** RoPE context scaling factor */
  ropeScale?: number;

  // ── Sampler defaults (passed at server start) ──────────
  /** Temperature (default: 1.0) */
  temp?: number;
  /** Top-K sampling (default: 40) */
  topK?: number;
  /** Top-P sampling (default: 0.95) */
  topP?: number;
  /** Min-P sampling (default: 0.01) */
  minP?: number;
  /** Repeat penalty (default: 1.05) */
  repeatPenalty?: number;

  // ── Server behavior ────────────────────────────────────
  /** Max parallel requests (default: 1) */
  parallelRequests?: number;
  /** Flash inference tuning (on = enable) */
  fit?: boolean;

  // ── Advanced ───────────────────────────────────────────
  /** Speculative decoding type: draft-eagle3, ngram-map-k4v, etc. */
  specType?: string;
  /** Min draft tokens for speculative decoding */
  specDraftNMin?: number;
  /** Max draft tokens for speculative decoding */
  specDraftNMax?: number;
  /** Reasoning/thinking budget in tokens (-1 = unlimited) */
  reasoningBudget?: number;
  /** Enable Jinja template processing (default: enabled) */
  jinja?: boolean;

  /** Extra CLI args passed to llama-server */
  extraArgs?: string[];
}

/** */
export interface SdCppAutoStartConfig {
  /** Master toggle — false = external server expected */
  enabled: boolean;
  /** "checkpoint" = standalone full model (-m), "diffusion" = component model (--diffusion-model, needs llm+vae) */
  modelType: SdModelType;
  /** Path to .safetensors model */
  modelPath: string;
  /** Port for sd-server (default: 9010) */
  port: number;

  // ── Text encoders (pick one or none) ────────────────────
  /** Path to LLM text encoder GGUF (Qwen, Mistral, etc.). Needed for most diffusion models. */
  llmPath?: string;
  /** Path to CLIP-L text encoder (SD1.x/SD2.x) */
  clipLPath?: string;
  /** Path to CLIP-G text encoder */
  clipGPath?: string;
  /** Path to T5-XXL text encoder */
  t5xxlPath?: string;

  // ── Model components ────────────────────────────────────
  /** Path to VAE safetensors. Optional — omit to use baked-in VAE. */
  vaePath?: string;
  /** VAE latent format override: auto, flux, sd3, or flux2 */
  vaeFormat?: string;
  /** Path to control net model */
  controlNetPath?: string;
  /** LoRA directory path */
  loraDir?: string;
  /** Path to TAESD for fast low-quality decoding */
  taesdPath?: string;
  /** Highres fix upscaler model directory */
  hiresUpscalersDir?: string;
  /** Embeddings directory */
  embdDir?: string;
  /** Path to PhotoMaker model */
  photoMakerPath?: string;
  /** Path to ESRGAN upscale model */
  upscaleModelPath?: string;

  // ── Performance / memory (boolean flags) ────────────────
  /** Flash attention (global). Default false. */
  fa?: boolean;
  /** Flash attention in diffusion model only */
  diffusionFA?: boolean;
  /** Process VAE in tiles to reduce memory */
  vaeTiling?: boolean;
  /** Load all params at model-load time instead of lazy */
  eagerLoad?: boolean;
  /** Place weights in RAM, load to VRAM on demand */
  offloadToCPU?: boolean;
  /** Enable residency+prefetch streaming (needs maxVram) */
  streamLayers?: boolean;
  /** Auto-pick diffusion/te/vae device placements from model size + VRAM budget */
  autoFit?: boolean;

  // ── Performance / memory (value flags) ──────────────────
  /** Max VRAM budget in GiB (graph-cut segmented execution) */
  maxVram?: string;
  /** Runtime backend assignment, e.g. "cpu" or "clip=cpu,vae=cuda0,diffusion=vulkan0" */
  backend?: string;
  /** RNG backend: std_default, cuda, or cpu */
  rng?: string;
  /** Sampler RNG. Defaults to --rng if not set. */
  samplerRng?: string;
  /** Weight type: f32, f16, q4_0, q4_1, q5_0, q5_1, q8_0, q2_K, q3_K, q4_K */
  type?: string;
  /** Prediction type override: eps, v, edm_v, sd3_flow, flux_flow, sefi_flow */
  prediction?: string;
  /** Cache method: easycache, ucache, dbcache, taylorseer, cache-dit, spectrum */
  cacheMode?: string;
  /** Cache params (key=value, comma-separated) */
  cacheOption?: string;

  /** Extra CLI args passed to sd-server */
  extraArgs?: string[];
}

/** */
export interface LlamaSwapAutoStartConfig {
  /** Enable auto-start of llama-swap proxy */
  enabled: boolean;
  /** Path to llama-swap config YAML */
  configPath: string;
}

/** */
export interface AutoStartConfig {
  /** Spawn llama.cpp server as child process at startup */
  llamaCpp?: LlamaCppAutoStartConfig;
  /** Spawn llama-swap proxy as child process at startup */
  llamaSwap?: LlamaSwapAutoStartConfig;
  /** Spawn sd-server as child process at startup */
  sdCpp?: SdCppAutoStartConfig;
}
