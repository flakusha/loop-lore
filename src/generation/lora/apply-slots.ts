// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LoRA slot application for slot-style ComfyUI loaders (WASPowerLoraLoader).
 *
 * `resolveLoraSlotNode` is the only place that knows which node classes carry
 * LoRA slots; `applyLoraSlots` is pure and only touches the resolved node.
 *
 * Upstream: https://raw.githubusercontent.com/WASasquatch/was-node-suite-comfyui/main/NODES.md:10911-10958
 * `None` leaves a row empty; `_enabled=false` only mutes a row that still
 * holds a model name, so unused slots must carry `None`.
 */

import type { LoRAModel, } from "./types";

/** One LoRA to place in a slot; `filename` is the full ComfyUI model name. */
export interface LoraSlotApplication {
  filename: string;
  strength: number;
}

/** Caller-shaped LoRA before discovery resolution. */
export interface LoraSlotRequest {
  name: string;
  strength: number;
}

/** A slot-capable node located in a graph. */
export interface ResolvedLoraSlotNode {
  nodeId: string;
  classType: string;
  slotIndices: number[];
}

/**
 * Per-variant slot metadata. Key names are a prefix plus suffixes so a future
 * variant adds one descriptor instead of scattered class_type checks.
 */
interface LoraSlotVariant {
  classType: string;
  slots: number;
  slotPrefix: string;
  weightSuffix: string;
  enabledSuffix: string;
  emptyValue: string;
}

const VARIANTS: readonly LoraSlotVariant[] = [
  {
    classType: "WASPowerLoraLoader",
    slots: 26,
    slotPrefix: "lora_",
    weightSuffix: "_weight",
    enabledSuffix: "_enabled",
    emptyValue: "None",
  },
];

function nameKey(variant: LoraSlotVariant, index: number,): string {
  return `${variant.slotPrefix}${index}`;
}

function weightKey(variant: LoraSlotVariant, index: number,): string {
  return `${variant.slotPrefix}${index}${variant.weightSuffix}`;
}

function enabledKey(variant: LoraSlotVariant, index: number,): string {
  return `${variant.slotPrefix}${index}${variant.enabledSuffix}`;
}

function isRecord(value: unknown,): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value,);
}

/**
 * Find the first slot-capable node. This is the ONLY class-detection point.
 * @param graph - ComfyUI API-format graph
 * @returns resolved node and its present slot indices, or null
 */
export function resolveLoraSlotNode(graph: unknown,): ResolvedLoraSlotNode | null {
  if (!isRecord(graph,)) { return null; }

  for (const [nodeId, value,] of Object.entries(graph,)) {
    if (!isRecord(value,) || typeof value.class_type !== "string") { continue; }
    const variant = VARIANTS.find((v,) => v.classType === value.class_type);
    if (!variant) { continue; }

    const inputs = isRecord(value.inputs,) ? value.inputs : {};
    const slotIndices: number[] = [];
    for (let i = 1; i <= variant.slots; i++) {
      if (nameKey(variant, i,) in inputs) { slotIndices.push(i,); }
    }

    return { nodeId, classType: variant.classType, slotIndices, };
  }

  return null;
}

/**
 * Fill the first N slots and clear the rest. Returns a cloned graph; the
 * input graph and all unrelated nodes (and their links) are untouched.
 * @param graph - ComfyUI API-format graph
 * @param resolved - node returned by `resolveLoraSlotNode`
 * @param slots - LoRAs in slot order
 * @throws when more LoRAs than slots are requested
 */
export function applyLoraSlots(
  graph: unknown,
  resolved: ResolvedLoraSlotNode,
  slots: readonly LoraSlotApplication[],
): Record<string, unknown> {
  if (slots.length > resolved.slotIndices.length) {
    throw new Error(
      `Requested ${slots.length} LoRAs but the workflow has only ${resolved.slotIndices.length} LoRA slots`,
    );
  }

  const variant = VARIANTS.find((v,) => v.classType === resolved.classType);
  if (!variant) { throw new Error(`Unknown LoRA slot variant: ${resolved.classType}`,); }
  if (!isRecord(graph,)) { throw new Error("LoRA slot graph must be an object",); }

  const node = graph[resolved.nodeId];
  if (!isRecord(node,) || !isRecord(node.inputs,)) {
    throw new Error(`LoRA slot node ${resolved.nodeId} not found in graph`,);
  }

  const inputs = { ...node.inputs, };
  resolved.slotIndices.forEach((index, ordinal,) => {
    const requested = slots[ordinal];
    if (requested) {
      inputs[nameKey(variant, index,)] = requested.filename;
      inputs[weightKey(variant, index,)] = requested.strength;
      inputs[enabledKey(variant, index,)] = true;
    } else {
      inputs[nameKey(variant, index,)] = variant.emptyValue;
      inputs[enabledKey(variant, index,)] = false;
    }
  },);

  return { ...graph, [resolved.nodeId]: { ...node, inputs, }, };
}

/** Match a caller name to a discovered model: full filename, then stripped name. */
export function findLoraModel(
  name: string,
  models: readonly LoRAModel[],
): LoRAModel | undefined {
  return models.find((m,) => m.filename === name) ??
    models.find((m,) => m.name === name);
}

/**
 * Resolve caller names against discovered models and take the full filename.
 * Unknown names throw so a caller cannot silently drop a requested LoRA.
 * @param requested - caller LoRAs (name + strength)
 * @param models - discovered models
 */
export function resolveLoraSlotFiles(
  requested: readonly LoraSlotRequest[],
  models: readonly LoRAModel[],
): LoraSlotApplication[] {
  return requested.map(({ name, strength, },) => {
    const model = findLoraModel(name, models,);
    if (!model) { throw new Error(`Unknown LoRA "${name}"`,); }
    return { filename: model.filename, strength, };
  },);
}
