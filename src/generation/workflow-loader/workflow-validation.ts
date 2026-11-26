// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { UNREFERENCED_LIVE_CLASSES, } from "../comfyui-converter/types";
import type { ComfyUIWorkflow, } from "../providers/comfyui";

/**
 * Node classes that produce output (or are live control nodes) and so have
 * no outgoing links. `Note` is deliberately NOT here: it is a frontend-only
 * annotation class ComfyUI does not register, so a graph whose only
 * unreferenced node is a Note fails at submit with missing_node_type / 400.
 *
 * A ComfyUI link is `[nodeId, slot]`, so a sink node is *never* referenced as
 * a link source. Unreferenced is therefore not a defect signal on its own —
 * every graph ends in one of these. Only an unreferenced node whose class is
 * neither a sink nor an annotation is dead.
 */
export const TERMINAL_SINK_CLASSES: ReadonlySet<string> = new Set([
  "PreviewImage",
  "SaveAnimatedPNG",
  "SaveAnimatedWEBP",
  "SaveImage",
  "SaveImageAdvanced",
  "SaveAudio",
  "SaveVideo",
  // Media sinks used by the pinned H3 workflow catalog.
  "DaSiWa_EnhancedVideoCombine",
  "DaSiWaH3ClipAssemble",
  "VHS_VideoCombine",
  "SaveImageAdvanced",
  // Control/config nodes the converter submits unreferenced but live.
  ...UNREFERENCED_LIVE_CLASSES,
],);

/** Frontend-only classes tolerated as dead annotations, never as output. */
const ANNOTATION_CLASSES: ReadonlySet<string> = new Set(["Note",],);

/**
 * Whether a graph contains at least one real output node.
 *
 * A Note-only placeholder passes a dead-node check (annotations are allowed
 * to sit unreferenced) but ComfyUI rejects it at submit time, so every ingest
 * path must require a class from {@link TERMINAL_SINK_CLASSES}.
 * @param workflow - API-format node map
 */
export function hasTerminalSink(workflow: ComfyUIWorkflow,): boolean {
  return Object.values(workflow,).some((node,) => TERMINAL_SINK_CLASSES.has(node.class_type,));
}

/**
 * Validate that a parsed JSON object is a valid ComfyUI workflow.
 *
 * A valid workflow is a non-empty Record where at least one value carries both
 * `inputs` and `class_type`, containing at least one real output node. A
 * Note-only stub is an annotation, not a runnable ComfyUI graph.
 * @param {unknown} obj
 * @returns {boolean}
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
      return hasTerminalSink(obj as ComfyUIWorkflow,);
    }
  }

  return false;
}

/**
 * A `[nodeId, slot]` link, the shape ComfyUI uses for cross-node inputs.
 * @param value
 */
function isLink(value: unknown,): value is [string, number,] {
  return Array.isArray(value,) && typeof value[0] === "string";
}

/**
 * Find nodes that nothing links *from* and that are neither sinks nor
 * frontend annotations.
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
    if (
      TERMINAL_SINK_CLASSES.has(node.class_type,) ||
      ANNOTATION_CLASSES.has(node.class_type,)
    ) { continue; }

    dead.push(id,);
  }

  return dead;
}
