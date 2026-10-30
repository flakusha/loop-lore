// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pinned `/object_info` snapshot accessors.
 *
 * The snapshot is the offline stand-in for the live graph: it names every
 * widget a class owns and the order positional `widgets_values` follow.
 * Widget-type detection is structural — an input whose spec tag is a basic
 * type (`INT`, `FLOAT`, `STRING`, `BOOLEAN`, `COMBO`, …) renders as a widget
 * when unlinked; socket types (`MODEL`, `IMAGE`, `CLIP`, …) never do.
 *
 * Required pack pins live wherever presence is decided (see `convert.ts`):
 * `comfyui_controlnet_aux` e8b689a, `ComfyUI_IPAdapter_plus` b188a6c,
 * `comfyui-tooling-nodes` b3ae4aa, `comfyui-inpaint-nodes` bd6d8fd.
 *
 * @module comfyui-converter/object-info
 */
import type { ObjectInfoClass, ObjectInfoSnapshot, } from "./types";

/** Input spec tags that render as widgets when the slot is unlinked. */
const WIDGET_TAGS = new Set([
  "INT",
  "FLOAT",
  "STRING",
  "BOOLEAN",
  "COMBO",
  "NUMBER",
],);

/** Phantom widgets the frontend renders without an input behind them. */
const PHANTOM_WIDGETS: Readonly<Record<string, readonly string[]>> = {
  KSampler: ["control_after_generate",],
  LoadImage: ["upload",],
};

/** Position of a phantom widget relative to its anchor input. */
const PHANTOM_AFTER: Readonly<Record<string, string>> = {
  control_after_generate: "seed",
  upload: "image",
};

/** First element of an `/object_info` input spec: the socket/widget tag. */
function specTag(spec: unknown,): string {
  if (!Array.isArray(spec,) || spec.length === 0) { return "?"; }
  const first = spec[0];
  if (typeof first === "string") { return first; }
  if (Array.isArray(first,)) { return "COMBO"; }
  return "?";
}

/** Declared inputs of a class in `input_order` (required, then optional). */
export function orderedInputs(info: ObjectInfoClass,): string[] {
  const order = info.input_order;
  if (order && (order.required || order.optional)) {
    return [...(order.required ?? []), ...(order.optional ?? []),];
  }

  const input = info.input;
  if (!input) { return []; }
  return [...Object.keys(input.required ?? {},), ...Object.keys(input.optional ?? {},),];
}

/**
 * Whether an input renders as a widget when unlinked. Primitive tags
 * (INT/FLOAT/STRING/BOOLEAN/NUMBER/COMBO) do; socket types (MODEL, LATENT,
 * IMAGE, CONDITIONING, pack customs) transport links only. Classification is
 * by tag alone: positional `widgets_values` never carry socket values, so a
 * widget slot per primitive input aligns exactly (verified on both
 * real-workflow fixtures).
 */
function isWidgetInput(info: ObjectInfoClass, name: string,): boolean {
  const spec = info.input?.required?.[name] ?? info.input?.optional?.[name];
  if (spec !== undefined) { return WIDGET_TAGS.has(specTag(spec,),); }
  return false;
}

/**
 * Positional widget sequence for a class: widget-type inputs in declaration
 * order, with frontend phantom widgets (e.g. KSampler's
 * `control_after_generate`) spliced after their anchor.
 */
export function widgetOrder(info: ObjectInfoClass, className: string,): string[] {
  const names = orderedInputs(info,).filter((name,) => isWidgetInput(info, name,));
  const phantoms = PHANTOM_WIDGETS[className] ?? [];
  if (phantoms.length === 0) { return names; }
  const placed = [...names,];
  for (const phantom of phantoms) {
    if (placed.includes(phantom,)) { continue; }
    const anchor = PHANTOM_AFTER[phantom];
    const at = anchor === undefined ? -1 : placed.indexOf(anchor,);
    placed.splice(at < 0 ? placed.length : at + 1, 0, phantom,);
  }

  return placed;
}

/** Look up a class in the snapshot; undefined when the server lacks it. */
export function lookupClass(snapshot: ObjectInfoSnapshot, className: string,): ObjectInfoClass | undefined {
  return snapshot[className];
}

/**
 * Phantom widgets of a class: they align positional values but never reach
 * the API graph (UI-only controls like the seed randomize toggle).
 */
export function phantomWidgets(className: string,): readonly string[] {
  return PHANTOM_WIDGETS[className] ?? [];
}
