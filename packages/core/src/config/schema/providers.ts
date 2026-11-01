// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/providers.ts — LLM / image generation provider config types
//
// Enum types sourced from @/db/enums.

import type { AudioApiFamily, ImageApiFamily, } from "@/db/enums";

/** */
export interface ModelLimits {
  /** Context window size in tokens */
  contextLimit: number;
  /** Max output tokens */
  maxOutput: number;
}

/** */
export interface ProviderInstanceConfig {
  /** Unique provider instance name (referenced in registry) */
  name: string;
  /** Human-readable label for UI */
  label: string;
  /** Base URL (e.g. http://localhost:8080/v1) */
  baseUrl: string;
  /** Server-level API key (overridden by user BYO key) */
  apiKey?: string;
  /** Default model ID */
  model: string;
  /** Connection timeout in ms */
  timeout: number;
  /** Max retries for transient failures */
  retries: number;
  /** Allow user API key override for this provider */
  allowUserApiKey: boolean;
  /** Extra headers sent with every request */
  headers?: Record<string, string>;
  /** Operator-declared native locale of this provider's models (LOCALE_REGISTRY code) */
  locale?: string;
  /** Known models (name → limits) */
  models: Record<string, ModelLimits>;
}

/** */
export interface ImageProviderDefaults {
  /** Default image width */
  width: number;
  /** Default image height */
  height: number;
  /** Default sampling steps */
  steps: number;
  /** Default CFG scale */
  cfgScale: number;
  /** Default sampler name (euler, euler_a, dpmpp_2m, etc.) */
  sampler: string;
  /** Default scheduler (discrete, karras, etc.) */
  scheduler?: string;
  /** Default negative prompt */
  negativePrompt?: string;
  /** LoRA model directory for relative path resolution */
  loraModelDir?: string;
  /** Default LoRA entries (path relative to loraModelDir) */
  loras?: { path: string; multiplier: number; isHighNoise?: boolean }[];
}

/** */
export interface ImageProviderConfig {
  /** Unique provider name */
  name: string;
  /** Human-readable label for UI */
  label: string;
  /** Base URL */
  baseUrl: string;
  /** API family: openai-compatible, SD WebUI, or SD cpp native */
  apiFamily: ImageApiFamily;
  /** Optional API key */
  apiKey?: string;
  /** Provider purpose — determines which use-case picks this provider */
  purpose?: "generate" | "edit" | "both";
  /** Default generation parameters */
  defaults: ImageProviderDefaults;
  /** Connection timeout in ms */
  timeout: number;
  /** Image generation timeout in ms */
  generationTimeout: number;
}

/** Audio generation provider (ComfyUI workflow based). */
export interface AudioProviderConfig {
  /** Unique provider instance name */
  name: string;
  /** Base URL of the ComfyUI server */
  baseUrl: string;
  /** API family: comfyui (audio workflow) */
  apiFamily: AudioApiFamily;
  /** ComfyUI workflow file under configs/workflows/ (e.g. "txt2audio") */
  workflow: string;
  /** Connection timeout in ms */
  timeout: number;
  /** Audio generation timeout in ms */
  generationTimeout: number;
}

/** */
export interface GenerationProvidersConfig {
  /** OpenAI-compatible providers (llama.cpp, vLLM, Ollama, LM Studio, etc.) */
  openaiCompatible: ProviderInstanceConfig[];
  /** Anthropic native API provider */
  anthropic?: ProviderInstanceConfig;
  /** Ollama native API provider (separate from openai-compatible mode) */
  ollamaNative?: ProviderInstanceConfig;
  /** Image generation providers (SD, FLUX, etc.) — first entry is default */
  sd?: ImageProviderConfig[];
  /** AWS Bedrock provider (Claude, Llama, Titan models) */
  bedrock?: BedrockProviderConfig;
  /** Audio generation providers (ComfyUI); empty means local synthesis only */
  audio?: AudioProviderConfig[];
  /** DeepL translation API provider (POST /v2/translate) */
  deepl?: DeepLProviderConfig;
  /** LibreTranslate translation API provider (POST /translate) */
  libretranslate?: LibreTranslateProviderConfig;
  /** Google Cloud Translation v2 provider (translate/v2 endpoint) */
  googleTranslate?: GoogleTranslateProviderConfig;
}

/**
 * DeepL translation API provider. The `model` field carries the DEFAULT
 * TARGET language (DeepL has no model concept) — e.g. "en-us" or "de";
 * per-request `model` overrides it in the complete() shim.
 */
export interface DeepLProviderConfig {
  /** Unique provider instance name (referenced in registry) */
  name: string;
  /** Human-readable label for UI */
  label: string;
  /** DeepL authentication key (sent as the `DeepL-Auth-Key` header) */
  authKey: string;
  /** true → free endpoint (api-free.deepl.com); false → pro (api.deepl.com) */
  freeTier: boolean;
  /** Default target language code (e.g. "en-us", "de") — the shim's "model" */
  model: string;
  /** Connection timeout in ms */
  timeout: number;
  /** Max retries for transient failures */
  retries: number;
  /** Allow user API key override for this provider */
  allowUserApiKey: boolean;
}

/**
 * LibreTranslate translation API provider. The `model` field carries the
 * DEFAULT TARGET language (LibreTranslate has no model concept).
 */
export interface LibreTranslateProviderConfig {
  /** Unique provider instance name (referenced in registry) */
  name: string;
  /** Human-readable label for UI */
  label: string;
  /** Base URL of the LibreTranslate instance (e.g. https://libretranslate.com) */
  baseUrl: string;
  /** API key (optional — many instances run without one) */
  apiKey?: string;
  /** Default target language code (e.g. "en", "pt") — the shim's "model" */
  model: string;
  /** Connection timeout in ms */
  timeout: number;
  /** Max retries for transient failures */
  retries: number;
  /** Allow user API key override for this provider */
  allowUserApiKey: boolean;
}

/**
 * Google Cloud Translation v2 provider. The `model` field carries the
 * DEFAULT TARGET language (the v2 API has no model concept).
 */
export interface GoogleTranslateProviderConfig {
  /** Unique provider instance name (referenced in registry) */
  name: string;
  /** Human-readable label for UI */
  label: string;
  /** Google Cloud API key with the Translation API enabled */
  apiKey: string;
  /** Default target language code (e.g. "en", "zh-CN") — the shim's "model" */
  model: string;
  /** Connection timeout in ms */
  timeout: number;
  /** Max retries for transient failures */
  retries: number;
  /** Allow user API key override for this provider */
  allowUserApiKey: boolean;
}

/** */
export interface BedrockProviderConfig {
  /** Unique provider instance name */
  name: string;
  /** Human-readable label for UI */
  label: string;
  /** AWS region (e.g., us-east-1) */
  region: string;
  /** AWS access key ID (optional - uses env vars if not set) */
  accessKeyId?: string;
  /** AWS secret access key (optional - uses env vars if not set) */
  secretAccessKey?: string;
  /** Default model ID/alias */
  model: string;
  /** Connection timeout in ms */
  timeout: number;
  /** Max retries for transient failures */
  retries: number;
  /** Whether user API keys can override */
  allowUserApiKey: boolean;
  /** Operator-declared native locale of these models (LOCALE_REGISTRY code) */
  locale?: string;
  /** Known models (name → limits) */
  models: Record<string, ModelLimits>;
}
