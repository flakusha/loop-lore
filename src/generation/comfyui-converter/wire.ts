// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-node wiring: widgets, promoted overrides, then link inputs.
 *
 * Widget values land first; promoted subgraph values overwrite by input
 * name; link references (`[originId, originSlot]`) win last. Inputs whose
 * link source vanished (muted/bypassed/dropped) are pruned and reported.
 *
 * @module comfyui-converter/wire
 */
import type { FlatNode, } from "./flatten";
import type { FlatLink, } from "./links";
import type {
  ApiGraph,
  ConversionResult,
  ConvertOptions,
  ObjectInfoSnapshot,
  PrunedDangling,
  UiNode,
  UnresolvedInput,
} from "./types";
import { linkedInputNames, mapWidgets, } from "./widgets";

/** Nodes that survived pruning, by flattened id. */
export interface LiveSet {
  readonly nodes: FlatNode[];
  readonly byId: Map<string, FlatNode>;
  readonly mutedDropped: string[];
  readonly bypassedDropped: string[];
  readonly notesSkipped: string[];
}

export interface WireState {
  readonly graph: ApiGraph;
  readonly unresolved: UnresolvedInput[];
  readonly pruned: PrunedDangling[];
  readonly packSeen: Map<string, { cnr_id?: string; ver?: string }>;
}

export function emptyWireState(): WireState {
  return { graph: {}, unresolved: [], pruned: [], packSeen: new Map(), };
}

/** Pack identity from UI properties (`_meta.cnr_id`/`ver` downstream). */
function recordPack(state: WireState, node: UiNode,): { cnr_id?: string; ver?: string } {
  const props = node.properties ?? {};
  const cnr_id = typeof props.cnr_id === "string" ? props.cnr_id : undefined;
  const ver = typeof props.ver === "string" ? props.ver : undefined;
  if (!state.packSeen.has(node.type,)) { state.packSeen.set(node.type, { cnr_id, ver, },); }
  return { cnr_id, ver, };
}

/** Wire one node: widgets, promoted overrides, then link inputs. */
export function wireNode(
  flat: FlatNode,
  linksById: Map<number, FlatLink>,
  live: LiveSet,
  snapshot: ObjectInfoSnapshot,
  promoted: Map<string, Map<string, unknown>>,
  boundaryIds: Set<string>,
  state: WireState,
  options: ConvertOptions,
): void {
  const { node, flatId, } = flat;
  const mapping = mapWidgets(node, flatId, snapshot, options,);
  state.unresolved.push(...mapping.unresolved,);
  const inputs: Record<string, unknown> = {};
  for (const [name, value,] of mapping.values) { inputs[name] = value; }
  for (const [name, value,] of promoted.get(flatId,) ?? []) {
    inputs[name] = Array.isArray(value,) ? { __value__: value, } : value;
  }

  const uiInputs = node.inputs ?? [];
  const linked = linkedInputNames(node,);
  for (const name of linked) {
    const slotIndex = uiInputs.findIndex((slot,) => slot.name === name);
    const slot = uiInputs[slotIndex];
    const link = linksById.get(slot?.link ?? -1,);
    if (link === undefined || boundaryIds.has(link.originId,)) {
      state.pruned.push({ node: flatId, input: name, from: link === undefined ? "unknown" : link.originId, },);
      continue;
    }

    if (!live.byId.has(link.originId,)) {
      state.pruned.push({ node: flatId, input: name, from: link.originId, },);
      continue;
    }

    inputs[name] = [link.originId, link.originSlot,];
  }

  const pack = recordPack(state, node,);
  const metaTitle = node.title;
  state.graph[flatId] = {
    inputs,
    class_type: node.type,
    _meta: {
      ...(metaTitle === undefined ? {} : { title: metaTitle, }),
      ...(pack.cnr_id === undefined ? {} : { cnr_id: pack.cnr_id, }),
      ...(pack.ver === undefined ? {} : { ver: pack.ver, }),
    },
  };
}

/** Assemble the report tail from wiring state. */
export function wireReport(state: WireState, live: LiveSet,): ConversionResult["report"] {
  return {
    mutedDropped: live.mutedDropped,
    bypassedDropped: live.bypassedDropped,
    notesSkipped: live.notesSkipped,
    unresolvedInputs: state.unresolved,
    prunedDangling: state.pruned,
    packIdentity: [...state.packSeen,].map(([cls, pack,],) => ({ class: cls, ...pack, })),
    nodeCount: live.nodes.length,
  };
}
