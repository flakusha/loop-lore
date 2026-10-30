// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * UI→API conversion orchestrator: flatten → prune → widgets → links.
 *
 * Muted (`mode` 2/4) and bypassed (`mode` 8) nodes are excluded and their
 * consumers' dangling inputs pruned, matching frontend export. Markdown/Note
 * nodes never execute and are skipped. Every surviving node becomes
 * `{ inputs, class_type, _meta }` with pack identity (`cnr_id`/`ver` from UI
 * properties) for `missingRequiredNodes` reuse.
 *
 * Required pack pins for presence decisions, per krita-ai-diffusion
 * `backend/resources.py` (STUDY ONLY — values recorded, no code ported):
 * `comfyui_controlnet_aux` e8b689a, `ComfyUI_IPAdapter_plus` b188a6c,
 * `comfyui-tooling-nodes` b3ae4aa, `comfyui-inpaint-nodes` bd6d8fd.
 *
 * @module comfyui-converter/convert
 * @throws {ConverterError} On unknown classes, missing subgraphs, malformed links.
 */
import { type FlatNode, flattenWorkflow, isSubgraphReference, } from "./flatten";
import { lookupClass, } from "./object-info";
import type {
  ConversionResult,
  ConvertOptions,
  ObjectInfoSnapshot,
  SubgraphDefinition,
  UiWorkflow,
} from "./types";
import { ConverterError, } from "./types";
import { emptyWireState, type LiveSet, wireNode, wireReport, } from "./wire";

/** UI node modes excluded from export. */
const MUTED_MODES = new Set([2, 4,],);
const BYPASS_MODE = 8;

/** Non-executing annotation nodes, skipped silently (reported, not errors). */
const NOTE_TYPES = new Set(["Note", "MarkdownNote",],);

/** Boundary pass-throughs left over from flattening; never executable. */
const BOUNDARY_TYPES = new Set(["SubgraphInput", "SubgraphOutput",],);

/** A definition id looks like a UUID; class names never contain a hyphen. */
function looksLikeDefinitionId(type: string,): boolean {
  return type.includes("-",);
}

/**
 * Drop muted/bypassed/note nodes; validate surviving classes.
 * @throws {ConverterError} On unknown classes or missing subgraph defs.
 */
function selectLiveNodes(
  nodes: readonly FlatNode[],
  workflow: UiWorkflow,
  snapshot: ObjectInfoSnapshot,
  globals: Readonly<Record<string, SubgraphDefinition>>,
): LiveSet {
  const live: FlatNode[] = [];
  const byId = new Map<string, FlatNode>();
  const mutedDropped: string[] = [];
  const bypassedDropped: string[] = [];
  const notesSkipped: string[] = [];
  for (const flat of nodes) {
    const mode = flat.node.mode ?? 0;
    if (MUTED_MODES.has(mode,)) {
      mutedDropped.push(flat.flatId,);
      continue;
    }

    if (mode === BYPASS_MODE) {
      bypassedDropped.push(flat.flatId,);
      continue;
    }

    if (NOTE_TYPES.has(flat.node.type,)) {
      notesSkipped.push(flat.flatId,);
      continue;
    }

    if (BOUNDARY_TYPES.has(flat.node.type,)) { continue; }
    if (lookupClass(snapshot, flat.node.type,) === undefined) {
      if (isSubgraphReference(flat.node.type, workflow, globals,) || looksLikeDefinitionId(flat.node.type,)) {
        throw new ConverterError({ kind: "missing-subgraph", node: flat.flatId, definition: flat.node.type, },);
      }

      throw new ConverterError({ kind: "unknown-class", node: flat.flatId, type: flat.node.type, },);
    }

    live.push(flat,);
    byId.set(flat.flatId, flat,);
  }

  return { nodes: live, byId, mutedDropped, bypassedDropped, notesSkipped, };
}

/** Promoted container values per flattened node: flat id → input → value. */
function collectPromoted(
  workflow: UiWorkflow,
  globals: Readonly<Record<string, SubgraphDefinition>>,
): Map<string, Map<string, unknown>> {
  const promoted = new Map<string, Map<string, unknown>>();
  const definitions = new Map((workflow.definitions?.subgraphs ?? []).map((def,) => [def.id, def,]),);
  for (const instance of workflow.nodes ?? []) {
    const definition = definitions.get(instance.type,) ?? globals[instance.type];
    if (definition === undefined) { continue; }
    const instanceId = String(instance.id,);
    const pins = definition.inputs ?? [];
    const named = instance.widgets_values_named ?? {};
    const positional = instance.widgets_values ?? [];
    const containerInputs = instance.inputs ?? [];
    const innerById = new Map((definition.nodes ?? []).map((node,) => [String(node.id,), node,]),);
    const innerLinks = new Map<number, { origin: string; target: string; slot: number }>();
    for (const link of definition.links ?? []) {
      if (Array.isArray(link,)) {
        innerLinks.set(link[0], { origin: String(link[1],), target: String(link[3],), slot: link[4], },);
      } else {
        const raw = link as { id: number; origin_id: unknown; target_id: unknown; target_slot: number };
        innerLinks.set(raw.id, {
          origin: String(raw.origin_id,),
          target: String(raw.target_id,),
          slot: raw.target_slot,
        },);
      }
    }

    const inputNodeId = definition.inputNode === undefined ? "-10" : String(definition.inputNode.id,);
    pins.forEach((pin, pinIndex,) => {
      if ((containerInputs[pinIndex]?.link ?? null) !== null) { return; }
      const value = pin.name in named ? named[pin.name] : positional[pinIndex];
      if (value === undefined) { return; }
      for (const linkId of pin.linkIds ?? []) {
        const inner = innerLinks.get(linkId,);
        if (inner === undefined || inner.origin !== inputNodeId) { continue; }
        const targetName = innerById.get(inner.target,)?.inputs?.[inner.slot]?.name;
        if (targetName === undefined) { continue; }
        const flatId = `${instanceId}:${inner.target}`;
        if (!promoted.has(flatId,)) { promoted.set(flatId, new Map(),); }
        promoted.get(flatId,)?.set(targetName, value,);
      }
    },);
  }

  return promoted;
}

/**
 * Convert a saved UI-format workflow to a flat API-format graph.
 * @param workflow - Saved UI-format workflow JSON.
 * @param snapshot - Pinned `/object_info` snapshot covering its classes.
 * @param options - Global-subgraph map and serialize-false overrides.
 * @throws {ConverterError} On unknown classes, missing subgraphs, malformed links.
 */
export function convertWorkflow(
  workflow: UiWorkflow,
  snapshot: ObjectInfoSnapshot,
  options: ConvertOptions = {},
): ConversionResult {
  const globals = options.globalSubgraphs ?? {};
  const flat = flattenWorkflow(workflow, { globalSubgraphs: globals, },);
  const live = selectLiveNodes(flat.nodes, workflow, snapshot, globals,);
  const linksById = new Map(flat.links.map((link,) => [link.id, link,]),);
  const promoted = collectPromoted(workflow, globals,);
  const boundaryIds = new Set<string>();
  for (const def of [...(workflow.definitions?.subgraphs ?? []), ...Object.values(globals,),]) {
    if (def.inputNode !== undefined) { boundaryIds.add(String(def.inputNode.id,),); }
    if (def.outputNode !== undefined) { boundaryIds.add(String(def.outputNode.id,),); }
  }

  const state = emptyWireState();
  for (const node of live.nodes) { wireNode(node, linksById, live, snapshot, promoted, boundaryIds, state, options,); }
  return { graph: state.graph, report: wireReport(state, live,), };
}
