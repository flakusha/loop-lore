// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ComfyUIWorkflow, } from "../providers/comfyui";

/**
 * Node classes that legitimately consume their inputs and produce no links.
 *
 * A ComfyUI link is `[nodeId, slot]`, so a sink node is *never* referenced as
 * a link source. Unreferenced is therefore not a defect signal on its own —
 * every graph ends in one of these. Only an unreferenced node whose class is
 * not a known sink is dead.
 */
export const TERMINAL_SINK_CLASSES: ReadonlySet<string> = new Set([
  "Note",
  "PreviewImage",
  "SaveAnimatedPNG",
  "SaveAnimatedWEBP",
  "SaveImage",
  "SaveVideo",
],);

/**
 * Validate that a parsed JSON object is a valid ComfyUI workflow.
 *
 * A valid workflow is a non-empty Record where at least one value carries both
 * `inputs` and `class_type`.
 */
export function isValidWorkflow(obj: unknown,): obj is ComfyUIWorkflow {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj,)) {
    return false;
  }

  const entries = Object.entries(obj as Record<string, unknown>,);
  if (entries.length === 0) { return false; }

  for (const [, value,] of entries) {
    if (typeof value !== "object" || value === null) { continue; }
    const node = value as Record<string, unknown>;
    if ("inputs" in node && "class_type" in node) {
      return true;
    }
  }
  return false;
}

/** A `[nodeId, slot]` link, the shape ComfyUI uses for cross-node inputs. */
function isLink(value: unknown,): value is [string, number,] {
  return Array.isArray(value,) && typeof value[0] === "string";
}

/**
 * Find nodes that nothing links *from* and that are not terminal sinks.
 *
 * @param workflow - Node map keyed by opaque id (`"5"`, `"60:45"`).
 * @returns Ids of dead nodes, in iteration order. Empty when the graph is sound.
 */
export function findDeadNodes(workflow: ComfyUIWorkflow,): string[] {
  const referenced = new Set<string>();

  for (const node of Object.values(workflow,)) {
    for (const value of Object.values(node.inputs ?? {},)) {
      if (isLink(value,)) { referenced.add(value[0],); }
    }
  }

  const dead: string[] = [];
  for (const [id, node,] of Object.entries(workflow,)) {
    if (referenced.has(id,)) { continue; }
    if (TERMINAL_SINK_CLASSES.has(node.class_type,)) { continue; }
    dead.push(id,);
  }
  return dead;
}
