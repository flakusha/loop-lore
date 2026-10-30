// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Widget value mapping: named-first, positional fallback, hidden preserved.
 *
 * `widgets_values_named` wins when present — positional `widgets_values` is
 * fragile across pack edits (see `types.ts` attribution). The positional
 * fallback resolves order through the snapshot's `input_order` (see
 * `object-info.ts`). Hidden JSON widgets (INPUT_TYPES `hidden: true`, e.g.
 * the Director's `timeline_data`/`builder_state`) are real inputs and are
 * preserved; frontend-only DOM widgets (`serialize === false`) are dropped.
 * Array values are wrapped `{ __value__: [...] }` for the API validator.
 * Unmapped values are reported, never silently dropped.
 *
 * @module comfyui-converter/widgets
 */
import { lookupClass, phantomWidgets, widgetOrder, } from "./object-info";
import type { ObjectInfoSnapshot, UiNode, UnresolvedInput, } from "./types";

/** Frontend-only widgets dropped per class (`serialize === false` in pack JS). */
const DEFAULT_SERIALIZE_FALSE: Readonly<Record<string, readonly string[]>> = {
  MiniMaxH3Director: ["minimax_h3_director_ui",],
  DaSiWa_SeedControl: ["dasiwa_seed_control_ui",],
  DaSiWa_EnhancedVideoCombine: ["video_preview",],
  ModelPreviewOverrideKJ: ["preview",],
  DaSiWa_Watermark: ["upload",],
  DaSiWa_LTX2LoraLoader: ["lora_stack_ui",],
};

/** Names of inputs currently fed by a link (widgets lose to links). */
export function linkedInputNames(node: UiNode,): Set<string> {
  const names = new Set<string>();
  for (const input of node.inputs ?? []) {
    if (input.link !== null && input.link !== undefined) { names.add(input.name,); }
  }

  return names;
}

/** Wrap array values the way the API validator expects. */
export function apiWidgetValue(value: unknown,): unknown {
  if (Array.isArray(value,)) { return { __value__: value, }; }
  return value;
}

/** Merge caller overrides over the pack-attested serialize-false table. */
function serializeFalseFor(
  className: string,
  overrides: Readonly<Record<string, readonly string[]>> | undefined,
): Set<string> {
  const base = DEFAULT_SERIALIZE_FALSE[className] ?? [];
  const extra = overrides?.[className] ?? [];
  return new Set([...base, ...extra,],);
}

export interface WidgetMapping {
  readonly values: Map<string, unknown>;
  readonly unresolved: UnresolvedInput[];
}

/**
 * Map one node's widget values onto its unlinked inputs.
 * @param nodeId - Flattened (final) node id for the report.
 * @throws Never throws — unmapped values land in `unresolved`.
 */
export function mapWidgets(
  node: UiNode,
  nodeId: string,
  snapshot: ObjectInfoSnapshot,
  options: { readonly serializeFalseWidgets?: Readonly<Record<string, readonly string[]>> } = {},
): WidgetMapping {
  const values = new Map<string, unknown>();
  const unresolved: UnresolvedInput[] = [];
  const info = lookupClass(snapshot, node.type,);
  const linked = linkedInputNames(node,);
  const dropped = serializeFalseFor(node.type, options.serializeFalseWidgets,);
  const phantoms = new Set(phantomWidgets(node.type,),);
  const named = node.widgets_values_named ?? {};
  const namedKeys = Object.keys(named,);
  if (namedKeys.length > 0) {
    const order = info === undefined ? [] : widgetOrder(info, node.type,);
    const known = new Set(order,);
    for (const key of namedKeys) {
      if (dropped.has(key,) || phantoms.has(key,)) { continue; }
      if (linked.has(key,)) { continue; }
      if (info !== undefined && !known.has(key,)) {
        unresolved.push({ node: nodeId, input: key, },);
        continue;
      }

      values.set(key, apiWidgetValue(named[key],),);
    }

    return { values, unresolved, };
  }

  const positional = node.widgets_values ?? [];
  if (positional.length === 0 || info === undefined) {
    positional.forEach((value, index,) => {
      if (value === undefined) { return; }
      unresolved.push({ node: nodeId, input: `widgets[${String(index,)}]`, },);
    },);

    return { values, unresolved, };
  }

  // Positional values cover every widget — including linked ones, whose stored
  // value link wiring overwrites afterwards. Filtering linked inputs here would
  // shift every later value (seen on EmptyFlux2LatentImage with linked width).
  const order = widgetOrder(info, node.type,).filter((name,) => !dropped.has(name,));
  positional.forEach((value, index,) => {
    const name = order[index];
    if (name === undefined) {
      unresolved.push({ node: nodeId, input: `widgets[${String(index,)}]`, },);
      return;
    }

    if (phantoms.has(name,)) { return; }
    values.set(name, apiWidgetValue(value,),);
  },);

  return { values, unresolved, };
}
