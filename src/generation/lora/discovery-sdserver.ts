// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * sd.cpp LoRA Discovery
 *
 * Discovers available LoRA models from the sd.cpp (stable-diffusion.cpp) backend.
 * Uses the /sd-api/v1/models endpoint to list available models,
 * then filters for LoRA files (.safetensors, .pt, .ckpt, .bin).
 *
 * @module generation/lora/discovery-sdserver
 */

import { discoveryErrorResult, fetchWithTimeout, } from "./discovery-http";
import type { LoRADiscoveryResult, LoRAModel, } from "./types";
import { extractLoRAName, isLoRAFilename, } from "./validation";

// ── sd.cpp Model Response Types ──────────────────────────

/**
 * Response from GET /sd-api/v1/models
 */
interface SdCppModelsResponse {
  data: SdCppModel[];
}

/**
 * Individual model from sd.cpp
 */
interface SdCppModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  root?: string;
  location?: string;
}

// ── Discovery Function ───────────────────────────────────

/**
 * Discover LoRA models from sd.cpp backend.
 *
 * @param baseUrl - sd.cpp server base URL (e.g., "http://localhost:9010")
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Discovery result with available LoRA models
 *
 * @example
 * ```ts
 * const result = await discoverSdCppLoras("http://localhost:9010");
 * if (result.error) {
 *   console.error("Discovery failed:", result.error);
 * } else {
 *   console.log("Found", result.models.length, "LoRA models");
 * }
 * ```
 */
export async function discoverSdCppLoras(
  baseUrl: string,
  timeoutMs = 10_000,
): Promise<LoRADiscoveryResult> {
  const timestamp = Date.now();
  const ctx = {
    backend: "sd-server" as const,
    label: "sd.cpp",
    baseUrl,
    timeoutMs,
    timestamp,
  };

  try {
    const url = `${baseUrl.replace(/\/+$/, "",)}/sd-api/v1/models`;

    const response = await fetchWithTimeout(url, timeoutMs,);

    if (!response.ok) {
      return {
        models: [],
        backend: "sd-server",
        timestamp,
        error: `sd.cpp returned ${response.status}: ${response.statusText}`,
      };
    }

    const data: SdCppModelsResponse = await response.json() as SdCppModelsResponse;

    // Filter for LoRA files
    const loraModels: LoRAModel[] = [];
    const models = data.data ?? [];

    for (const model of models) {
      const filename = model.root ?? model.id ?? model.location ?? "";

      if (!filename || !isLoRAFilename(filename,)) {
        continue;
      }

      const name = extractLoRAName(filename,);
      const path = model.location ?? model.root ?? filename;

      loraModels.push({
        name,
        filename,
        path,
        backend: "sd-server",
      },);
    }

    return {
      models: loraModels,
      backend: "sd-server",
      timestamp,
    };
  } catch (error) {
    return discoveryErrorResult(error, ctx,);
  }
}

// ── Prompt Injection ─────────────────────────────────────

/**
 * Build sd.cpp LoRA prompt prefix.
 *
 * sd.cpp applies LoRA via prompt injection in the format:
 * `[lora:name:strength]`
 *
 * @param name - LoRA model name (without extension)
 * @param strength - Application strength (0.1-1.0)
 * @returns Prompt prefix string
 *
 * @example
 * ```ts
 * const prefix = buildSdCppLoraPrefix("my_character", 0.7);
 * // prefix === "[lora:my_character:0.7]"
 * ```
 */
export function buildSdCppLoraPrefix(name: string, strength: number,): string {
  return `[lora:${name}:${strength}]`;
}

/**
 * Inject LoRA into a prompt for sd.cpp.
 *
 * @param prompt - Original prompt
 * @param name - LoRA model name
 * @param strength - Application strength
 * @returns Modified prompt with LoRA prefix
 *
 * @example
 * ```ts
 * const prompt = injectSdCppLora("a beautiful portrait", "my_character", 0.7);
 * // prompt === "[lora:my_character:0.7] a beautiful portrait"
 * ```
 */
export function injectSdCppLora(prompt: string, name: string, strength: number,): string {
  const prefix = buildSdCppLoraPrefix(name, strength,);
  return `${prefix} ${prompt}`;
}
