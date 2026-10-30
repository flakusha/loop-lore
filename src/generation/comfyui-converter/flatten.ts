// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Subgraph flattening: instance → inner nodes with colon-path ids.
 *
 * A subgraph instance (a UI node whose `type` is a definition id) is replaced
 * by the definition's inner nodes, re-keyed `<instanceId>:<innerId>` — node
 * ids stay opaque strings throughout, never `Number()`ed. Links that crossed
 * the instance boundary are rewritten against the definition's boundary pins:
 * an outer link into container slot N fans out to the inner targets of
 * `inputs[N].linkIds`; an outer link out of container slot K re-roots at the
 * inner origin of `outputs[K].linkIds`. Container slot order matches
 * definition pin order (verified on the v-0010 fixture).
 *
 * @module comfyui-converter/flatten
 */
import { type FlatLink, indexLinks, normalizeLink, pinOrigins, pinTargets, } from "./links";
import type {
  SubgraphDefinition,
  UiNode,
  UiWorkflow,
} from "./types";
import { ConverterError, } from "./types";

/** A node carrying its flattened (colon-path) id. */
export interface FlatNode {
  readonly flatId: string;
  readonly node: UiNode;
  readonly instanceId: string | null;
}

/** Flattened workflow: nodes with final ids plus rewired links. */
export interface FlatWorkflow {
  readonly nodes: readonly FlatNode[];
  readonly links: readonly FlatLink[];
}

interface FlattenState {
  readonly nodes: FlatNode[];
  readonly links: FlatLink[];
  readonly definitions: Map<string, SubgraphDefinition>;
  readonly globals: Readonly<Record<string, SubgraphDefinition>>;
  nextLinkId: number;
}

/** Remap inner boundary input links: id → replacement outer id, or null when promoted. */
function remapBoundaryInputs(
  state: FlattenState,
  instance: UiNode,
  instanceId: string,
  definition: SubgraphDefinition,
  innerLinks: Map<number, FlatLink>,
  inputNodeId: string,
): Map<number, number | null> {
  const remap = new Map<number, number | null>();
  const containerPins = definition.inputs ?? [];
  (instance.inputs ?? []).forEach((slot, slotIndex,) => {
    const pin = containerPins[slotIndex];
    if (pin === undefined) { return; }
    const targets = pinTargets(pin, innerLinks, inputNodeId,);
    if (slot.link === null || slot.link === undefined) {
      for (const inner of targets) { remap.set(inner.id, null,); }
      return;
    }

    const outerIndex = state.links.findIndex((link,) => link.id === slot.link);
    if (outerIndex < 0) { return; }
    const [outer,] = state.links.splice(outerIndex, 1,);
    if (outer === undefined) { return; }
    targets.forEach((inner, copyIndex,) => {
      const copyId = copyIndex === 0 ? outer.id : state.nextLinkId++;
      remap.set(inner.id, copyId,);
      state.links.push({
        ...outer,
        id: copyId,
        targetId: `${instanceId}:${inner.targetId}`,
        targetSlot: inner.targetSlot,
      },);
    },);
  },);

  return remap;
}

/** Clone an inner node with boundary input links remapped (null drops the link). */
function remapInnerNode(inner: UiNode, remap: Map<number, number | null>,): UiNode {
  if ((inner.inputs ?? []).every((slot,) => !remap.has(slot.link ?? -1,))) { return inner; }
  return {
    ...inner,
    inputs: (inner.inputs ?? []).map((slot,) => {
      if (slot.link === null || slot.link === undefined || !remap.has(slot.link,)) { return slot; }
      return { ...slot, link: remap.get(slot.link,) ?? null, };
    },),
  };
}

/** Inline one subgraph instance; outer links touching it are rewritten. */
function inlineInstance(
  state: FlattenState,
  instance: UiNode,
  instanceId: string,
  definition: SubgraphDefinition,
): void {
  const innerNodes = definition.nodes ?? [];
  const innerLinks = indexLinks(definition.links ?? [],);
  const inputNodeId = definition.inputNode === undefined ? "-10" : String(definition.inputNode.id,);
  const outputNodeId = definition.outputNode === undefined ? "-20" : String(definition.outputNode.id,);
  const remap = remapBoundaryInputs(state, instance, instanceId, definition, innerLinks, inputNodeId,);
  for (const inner of innerNodes) {
    state.nodes.push({
      flatId: `${instanceId}:${String(inner.id,)}`,
      node: remapInnerNode(inner, remap,),
      instanceId,
    },);
  }

  for (const inner of innerLinks.values()) {
    const originInner = inner.originId !== inputNodeId && inner.originId !== outputNodeId;
    const targetInner = inner.targetId !== inputNodeId && inner.targetId !== outputNodeId;
    if (originInner && targetInner) {
      state.links.push({
        ...inner,
        originId: `${instanceId}:${inner.originId}`,
        targetId: `${instanceId}:${inner.targetId}`,
      },);
    }
  }

  const outputs = instance.outputs ?? [];
  outputs.forEach((slot, slotIndex,) => {
    const pin = (definition.outputs ?? [])[slotIndex];
    if (pin === undefined) { return; }
    for (const linkId of slot.links ?? []) {
      const outerIndex = state.links.findIndex((link,) => link.id === linkId);
      if (outerIndex < 0) { continue; }
      const origins = pinOrigins(pin, innerLinks, outputNodeId,);
      const [outer,] = state.links.splice(outerIndex, 1,);
      if (outer === undefined) { continue; }
      origins.forEach((inner, copyIndex,) => {
        state.links.push({
          ...outer,
          id: copyIndex === 0 ? outer.id : state.nextLinkId++,
          originId: `${instanceId}:${inner.originId}`,
          originSlot: inner.originSlot,
        },);
      },);
    }
  },);

  for (let index = state.links.length - 1; index >= 0; index--) {
    const link = state.links[index];
    if (link !== undefined && (link.originId === instanceId || link.targetId === instanceId)) {
      state.links.splice(index, 1,);
    }
  }
}

/**
 * Flatten a UI workflow: inline every subgraph instance, rewrite boundary
 * links, drop the instance nodes themselves.
 * @param workflow - Saved UI-format workflow JSON.
 * @param options - Global-subgraph map for references without local defs.
 * @throws {ConverterError} On malformed links or a missing subgraph definition.
 */
export function flattenWorkflow(
  workflow: UiWorkflow,
  options: { readonly globalSubgraphs?: Readonly<Record<string, SubgraphDefinition>> } = {},
): FlatWorkflow {
  if (!Array.isArray(workflow.nodes,)) {
    throw new ConverterError({ kind: "malformed-workflow", detail: "workflow.nodes is not an array", },);
  }

  const topLinks = (workflow.links ?? []).map(normalizeLink,);
  const innerIds = (workflow.definitions?.subgraphs ?? []).flatMap((def,) =>
    (def.links ?? []).map((link,) => normalizeLink(link,).id)
  );

  const state: FlattenState = {
    nodes: [],
    links: topLinks,
    definitions: new Map((workflow.definitions?.subgraphs ?? []).map((def,) => [def.id, def,]),),
    globals: options.globalSubgraphs ?? {},
    nextLinkId: Math.max(0, ...topLinks.map((link,) => link.id), ...innerIds,) + 1,
  };

  for (const node of workflow.nodes) {
    if (typeof node.type !== "string") {
      throw new ConverterError({ kind: "malformed-workflow", detail: `node ${String(node.id,)} has no type`, },);
    }

    const definition = state.definitions.get(node.type,) ?? state.globals[node.type];
    if (definition !== undefined) {
      inlineInstance(state, node, String(node.id,), definition,);
    } else {
      state.nodes.push({ flatId: String(node.id,), node, instanceId: null, },);
    }
  }

  return { nodes: state.nodes, links: state.links, };
}

/**
 * Whether a node type names a subgraph definition (local or global) rather
 * than an executable class. Callers use it to separate “missing subgraph”
 * from “unknown class” failures.
 */
export function isSubgraphReference(
  type: string,
  workflow: UiWorkflow,
  globals: Readonly<Record<string, SubgraphDefinition>> = {},
): boolean {
  if ((workflow.definitions?.subgraphs ?? []).some((def,) => def.id === type)) { return true; }
  return globals[type] !== undefined;
}
