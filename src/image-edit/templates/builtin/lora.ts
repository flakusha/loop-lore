// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { allocateNodeId, } from "../../../generation/node-id";
import type { ComfyUIWorkflow, } from "../../../generation/providers/comfyui";
import type { LoraEntry, } from "../../types";

/**
 * Parse LoRA entries from comma-separated string: "path:strength,path:strength"
 * @param loraStr
 * @returns {LoraEntry[]}
 */
export function parseLoraString(loraStr: string,): LoraEntry[] {
  const entries: LoraEntry[] = [];
  if (!loraStr.trim()) { return entries; }

  for (const entry of loraStr.split(",",)) {
    const trimmed = entry.trim();
    if (!trimmed) { continue; }
    const colonIdx = trimmed.lastIndexOf(":",);
    if (colonIdx > 0) {
      const path = trimmed.slice(0, colonIdx,);
      const strength = Number.parseFloat(trimmed.slice(colonIdx + 1,),);
      if (path && !Number.isNaN(strength,)) {
        entries.push({ path, strength, },);
      }
    } else {
      entries.push({ path: trimmed, strength: 1, },);
    }
  }
  return entries;
}

/**
 * Build ComfyUI LORA nodes from a list of LoraEntry objects.
 * Returns workflow nodes and the final model/clip output refs
 * after all LORAs have been applied.
 * `reserved` is **required**: ids the caller will use for other nodes. It is
 * not optional because a caller that omits it reintroduces the silent-clobber
 * bug this replaces (ids used to be hardcoded from 100, unchecked).
 *
 * @param loras
 * @param startModelRef
 * @param startClipRef
 * @param reserved
 * @returns {{ nodes: ComfyUIWorkflow; modelRef: [string, number]; clipRef: [string, number]; }}
 */
export function buildLoraNodes(
  loras: LoraEntry[],
  startModelRef: [string, number,],
  startClipRef: [string, number,],
  reserved: Iterable<string>,
): { nodes: ComfyUIWorkflow; modelRef: [string, number,]; clipRef: [string, number,] } {
  const nodes: ComfyUIWorkflow = {};
  let currentModel = startModelRef;
  let currentClip = startClipRef;
  const taken = new Set(reserved,);

  for (const lora of loras) {
    const id = allocateNodeId(taken,);
    taken.add(id,);
    nodes[id] = {
      inputs: {
        lora_name: lora.path,
        strength_model: lora.strength,
        strength_clip: lora.strength,
        model: currentModel,
        clip: currentClip,
      },
      class_type: "LoraLoader",
      _meta: { title: `LoRA: ${lora.path}`, },
    };
    currentModel = [id, 0,];
    currentClip = [id, 1,];
  }

  return { nodes, modelRef: currentModel, clipRef: currentClip, };
}
