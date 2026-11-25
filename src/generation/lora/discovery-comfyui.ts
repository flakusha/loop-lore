// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI LoRA Discovery
 *
 * Discovers available LoRA models from the ComfyUI backend.
 * Uses the /object_info endpoint to extract available models
 * from the LoraLoader node's input configuration.
 * @module generation/lora/discovery-comfyui
 */

import { allocateNodeId, } from "../node-id";
import { discoveryErrorResult, fetchWithTimeout, } from "./discovery-http";
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
 * @param baseUrl - ComfyUI server base URL (e.g., "http://localhost:8188")
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Discovery result with available LoRA models
 */
export async function discoverComfyUILoras(
  baseUrl: string,
  timeoutMs = 10_000,
): Promise<LoRADiscoveryResult> {
  const timestamp = Date.now();
  const ctx = {
    backend: "comfyui" as const,
    label: "ComfyUI",
    baseUrl,
    timeoutMs,
    timestamp,
  };

  try {
    const url = `${baseUrl.replace(/\/+$/, "",)}/object_info`;

    const response = await fetchWithTimeout(url, timeoutMs,);

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
    const loraModels: LoRAModel[] = [];
    for (const name of modelNames) {
      if (typeof name === "string" && name.length > 0) {
        loraModels.push({
          name: extractLoRAName(name,),
          filename: name,
          path: name, // ComfyUI uses relative paths from models/loras/
          backend: "comfyui" as const,
        },);
      }
    }

    return {
      models: loraModels,
      backend: "comfyui",
      timestamp,
    };
  } catch (error) {
    return discoveryErrorResult(error, ctx,);
  }
}

// ── Workflow Node Builder ────────────────────────────────

/**
 * API-format input links are `[producerId, outputSlot]` tuples. UI-only
 * `outputs` metadata is absent from submitted /prompt graphs.
 */
function asComfyLink(value: unknown,): [string, number,] | undefined {
  if (!Array.isArray(value,) || value.length !== 2) { return undefined; }
  const [id, slot,] = value;
  if (
    (typeof id !== "string" && typeof id !== "number") ||
    typeof slot !== "number" ||
    !Number.isInteger(slot,)
  ) {
    return undefined;
  }

  return [String(id,), slot,];
}

/**
 * Build a ComfyUI LoraLoader node for workflow injection.
 * @param loraName - LoRA model filename (with extension)
 * @param strengthModel - Model strength (0.1-1.0, typical 0.3-0.7)
 * @param strengthClip - CLIP strength (defaults to model strength)
 * @param modelLink - MODEL producer link `[nodeId, outputSlot]`
 * @param clipLink - CLIP producer link `[nodeId, outputSlot]`
 * @returns ComfyUI workflow node
 */
export function buildComfyUILoraNode(
  loraName: string,
  strengthModel: number,
  strengthClip?: number,
  modelLink?: [string, number,],
  clipLink?: [string, number,],
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {
    lora_name: loraName,
    strength_model: strengthModel,
    strength_clip: strengthClip ?? strengthModel,
  };

  if (modelLink) { inputs.model = modelLink; }
  if (clipLink) { inputs.clip = clipLink; }

  return { class_type: "LoraLoader", inputs, };
}

/**
 * Inject LoraLoader nodes into a ComfyUI workflow.
 * @param workflow - Original workflow
 * @param loraName - LoRA model filename
 * @param strengthModel - Model strength
 * @param strengthClip - CLIP strength (optional, defaults to model strength)
 * @param targetNodeId - Explicit producer node id (optional, resolved from links)
 * @returns Modified workflow with LoraLoader nodes inserted
 */
export function injectComfyUILora(
  workflow: Record<string, unknown>,
  loraName: string,
  strengthModel: number,
  strengthClip?: number,
  targetNodeId?: string,
): Record<string, unknown> {
  // Clone inputs so rewiring never mutates the caller's graph.
  const nodes: Record<string, Record<string, unknown>> = {};
  for (const [id, rawNode,] of Object.entries(workflow,)) {
    const node = rawNode as Record<string, unknown>;
    const originalInputs = (node.inputs ?? {}) as Record<string, unknown>;
    nodes[id] = { ...node, inputs: { ...originalInputs, }, };
  }

  const consumers: Array<{
    inputs: Record<string, unknown>;
    key: string;
    producerId: string;
    slot: number;
  }> = [];

  const producers = new Map<string, { modelSlots: number[]; clipSlots: number[] }>();

  for (const node of Object.values(nodes,)) {
    const inputs = node.inputs as Record<string, unknown>;
    for (const key of ["model", "clip",] as const) {
      const link = asComfyLink(inputs[key],);
      if (!link) { continue; }
      const [producerId, slot,] = link;
      consumers.push({ inputs, key, producerId, slot, },);
      const slots = producers.get(producerId,) ?? { modelSlots: [], clipSlots: [], };
      (key === "model" ? slots.modelSlots : slots.clipSlots).push(slot,);
      producers.set(producerId, slots,);
    }
  }

  // A producer feeding both MODEL and CLIP consumers is the loader to insert
  // after. On repeated injection the previous LoraLoader is that producer, so
  // each new loader consumes its predecessor's outputs in request order.
  const producerIds = [...producers.keys(),];
  const producerId = targetNodeId ??
    producerIds.find((id,) => {
      const slots = producers.get(id,);
      return Boolean(slots?.modelSlots.length && slots.clipSlots.length,);
    },) ??
    producerIds[0];

  const slots = producerId ? producers.get(producerId,) : undefined;
  const modelSlot = slots?.modelSlots[0] ?? 0;
  const clipSlot = slots?.clipSlots[0] ?? 1;

  const newNodeId = allocateNodeId(Object.keys(nodes,),);
  nodes[newNodeId] = buildComfyUILoraNode(
    loraName,
    strengthModel,
    strengthClip,
    producerId ? [producerId, modelSlot,] : undefined,
    producerId ? [producerId, clipSlot,] : undefined,
  );

  for (const consumer of consumers) {
    if (consumer.producerId !== producerId) { continue; }
    if (consumer.key === "model" && consumer.slot === modelSlot) {
      consumer.inputs.model = [newNodeId, 0,];
    } else if (consumer.key === "clip" && consumer.slot === clipSlot) {
      consumer.inputs.clip = [newNodeId, 1,];
    }
  }

  return nodes;
}
