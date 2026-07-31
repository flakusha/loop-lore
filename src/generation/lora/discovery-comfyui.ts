/**
 * ComfyUI LoRA Discovery
 *
 * Discovers available LoRA models from the ComfyUI backend.
 * Uses the /object_info endpoint to extract available models
 * from the LoraLoader node's input configuration.
 *
 * @module generation/lora/discovery-comfyui
 */

import type { LoRADiscoveryResult, LoRAModel, } from "./types";
import { extractLoRAName, } from "./validation";

// ── ComfyUI Object Info Types ────────────────────────────

/**
 * Response from GET /object_info
 */
interface ComfyUIObjectInfo {
  LoraLoader?: ComfyUILoraLoaderInfo;
  [key: string]: unknown;
}

/**
 * LoraLoader node info from /object_info
 */
interface ComfyUILoraLoaderInfo {
  input: {
    required: {
      lora_name: [string[], Record<string, unknown>,];
      strength_model?: [number, Record<string, unknown>,];
      strength_clip?: [number, Record<string, unknown>,];
    };
  };
}

// ── Discovery Function ───────────────────────────────────

/**
 * Discover LoRA models from ComfyUI backend.
 *
 * Extracts available LoRA models from the LoraLoader node's
 * input configuration in the /object_info response.
 *
 * @param baseUrl - ComfyUI server base URL (e.g., "http://localhost:8188")
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Discovery result with available LoRA models
 *
 * @example
 * ```ts
 * const result = await discoverComfyUILoras("http://localhost:8188");
 * if (result.error) {
 *   console.error("Discovery failed:", result.error);
 * } else {
 *   console.log("Found", result.models.length, "LoRA models");
 * }
 * ```
 */
export async function discoverComfyUILoras(
  baseUrl: string,
  timeoutMs = 10_000,
): Promise<LoRADiscoveryResult> {
  const timestamp = Date.now();

  try {
    const url = `${baseUrl.replace(/\/+$/, "",)}/object_info`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs,);

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json", },
      signal: controller.signal,
    },);

    clearTimeout(timeout,);

    if (!response.ok) {
      return {
        models: [],
        backend: "comfyui",
        timestamp,
        error: `ComfyUI returned ${response.status}: ${response.statusText}`,
      };
    }

    const data: ComfyUIObjectInfo = await response.json() as ComfyUIObjectInfo;

    // Extract LoraLoader node info
    const loraLoader = data.LoraLoader;

    if (!loraLoader?.input?.required?.lora_name) {
      return {
        models: [],
        backend: "comfyui",
        timestamp,
        error: "LoraLoader node not found in ComfyUI",
      };
    }

    // Extract model names from the lora_name input
    const modelNames = loraLoader.input.required.lora_name[0];

    if (!Array.isArray(modelNames,)) {
      return {
        models: [],
        backend: "comfyui",
        timestamp,
        error: "Invalid LoraLoader node configuration",
      };
    }

    // Convert to LoRAModel objects
    const loraModels: LoRAModel[] = modelNames
      .filter((name: string,) => typeof name === "string" && name.length > 0)
      .map((name: string,) => ({
        name: extractLoRAName(name,),
        filename: name,
        path: name, // ComfyUI uses relative paths from models/loras/
        backend: "comfyui" as const,
      }));

    return {
      models: loraModels,
      backend: "comfyui",
      timestamp,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);

    // Handle abort (timeout)
    if (message.includes("abort",) || message.includes("AbortError",)) {
      return {
        models: [],
        backend: "comfyui",
        timestamp,
        error: `ComfyUI discovery timed out after ${timeoutMs}ms`,
      };
    }

    // Handle connection errors
    if (message.includes("ECONNREFUSED",) || message.includes("fetch failed",)) {
      return {
        models: [],
        backend: "comfyui",
        timestamp,
        error: `ComfyUI server not reachable at ${baseUrl}`,
      };
    }

    return {
      models: [],
      backend: "comfyui",
      timestamp,
      error: `ComfyUI discovery error: ${message}`,
    };
  }
}

// ── Workflow Node Builder ────────────────────────────────

/**
 * Build a ComfyUI LoraLoader node for workflow injection.
 *
 * @param loraName - LoRA model filename (with extension)
 * @param strengthModel - Model strength (0.1-1.0, typical 0.3-0.7)
 * @param strengthClip - CLIP strength (defaults to model strength)
 * @param previousNodeId - Node ID to connect as input (optional)
 * @returns ComfyUI workflow node
 *
 * @example
 * ```ts
 * const node = buildComfyUILoraNode("my_character.safetensors", 0.7);
 * // node.class_type === "LoraLoader"
 * // node.inputs.lora_name === "my_character.safetensors"
 * // node.inputs.strength_model === 0.7
 * ```
 */
export function buildComfyUILoraNode(
  loraName: string,
  strengthModel: number,
  strengthClip?: number,
  previousNodeId?: string,
): Record<string, unknown> {
  const node: Record<string, unknown> = {
    class_type: "LoraLoader",
    inputs: {
      lora_name: loraName,
      strength_model: strengthModel,
      strength_clip: strengthClip ?? strengthModel,
    },
  };

  // Connect to previous node if specified
  if (previousNodeId) {
    (node.inputs as Record<string, unknown>).model = [previousNodeId, 0,];
    (node.inputs as Record<string, unknown>).clip = [previousNodeId, 1,];
  }

  return node;
}

/**
 * Inject LoraLoader nodes into a ComfyUI workflow.
 *
 * @param workflow - Original workflow
 * @param loraName - LoRA model filename
 * @param strengthModel - Model strength
 * @param strengthClip - CLIP strength (optional, defaults to model strength)
 * @param targetNodeId - Node ID to inject after (optional, uses first MODEL/CLIP output)
 * @returns Modified workflow with LoraLoader node inserted
 *
 * @example
 * ```ts
 * const modified = injectComfyUILora(workflow, "my_character.safetensors", 0.7);
 * // modified now contains a LoraLoader node
 * ```
 */
export function injectComfyUILora(
  workflow: Record<string, unknown>,
  loraName: string,
  strengthModel: number,
  strengthClip?: number,
  targetNodeId?: string,
): Record<string, unknown> {
  const modified = { ...workflow, };

  // Find the target node
  const nodes = modified as Record<string, Record<string, unknown>>;
  let nodeId = targetNodeId;

  if (!nodeId) {
    // Find first node with MODEL and CLIP outputs
    for (const [id, node,] of Object.entries(nodes,)) {
      if (typeof node !== "object" || node === null) { continue; }
      const outputs = node.outputs as Record<string, unknown[]> | undefined;
      if (outputs?.MODEL && outputs?.CLIP) {
        nodeId = id;
        break;
      }
    }
  }

  if (!nodeId) {
    // No suitable node found, add at end
    const maxId = Math.max(...Object.keys(nodes,).map(Number,), 0,);
    nodeId = String(maxId + 1,);
  }

  // Generate new node ID
  const allIds = Object.keys(nodes,).map(Number,);
  const newNodeId = String(Math.max(...allIds, 0,) + 1,);

  // Create LoraLoader node
  const loraNode = buildComfyUILoraNode(loraName, strengthModel, strengthClip, nodeId,);

  // Add to workflow
  nodes[newNodeId] = loraNode;

  return modified;
}
