import type { ComfyUIWorkflow, } from "../../../generation/providers/comfyui";
import type { LoraEntry, } from "../../types";

/** Parse LoRA entries from comma-separated string: "path:strength,path:strength" */
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
 */
export function buildLoraNodes(
  loras: LoraEntry[],
  startModelRef: [string, number,],
  startClipRef: [string, number,],
): { nodes: ComfyUIWorkflow; modelRef: [string, number,]; clipRef: [string, number,] } {
  const nodes: ComfyUIWorkflow = {};
  let currentModel = startModelRef;
  let currentClip = startClipRef;
  let nodeIndex = 100; // Start LORA nodes at 100 to avoid collisions

  for (const lora of loras) {
    const id = String(nodeIndex,);
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
    nodeIndex++;
  }

  return { nodes, modelRef: currentModel, clipRef: currentClip, };
}
