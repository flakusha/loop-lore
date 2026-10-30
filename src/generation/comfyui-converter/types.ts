// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * UI→API workflow converter — shared shapes.
 *
 * Converts a saved ComfyUI UI-format workflow (`nodes` + `links` + optional
 * `definitions.subgraphs`) into the flat API-format map (`node-id →
 * { inputs, class_type, _meta }`) that `POST /prompt` accepts, guided by a
 * pinned `/object_info` snapshot. Pure data; no editor, no server.
 *
 * Traversal follows the dual-format collection in
 * `comfy-workflow-studio` (MIT © 2026 ketle-man),
 * `py/services/workflow_analyzer.py::_collect_all_ui_nodes` — UI nodes live
 * at top level plus inside each `definitions.subgraphs[]` entry. Name-first
 * widget mapping follows that project's documented positional fragility
 * (`CLAUDE.md`: `widgets_values` is stored by position index, so inserting a
 * widget silently shifts every saved value — hence names win when present).
 *
 * @module comfyui-converter/types
 */

/** A link in either UI encoding: array tuple or object form. */
export type UiLinkArray = readonly [
  id: number,
  originId: number | string,
  originSlot: number,
  targetId: number | string,
  targetSlot: number,
  type: string,
];

/** Object-encoded link (as emitted inside subgraph definitions). */
export interface UiLinkObject {
  readonly id: number;
  readonly origin_id: number | string;
  readonly origin_slot: number;
  readonly target_id: number | string;
  readonly target_slot: number;
  readonly type: string;
}

/** Either link encoding accepted everywhere links are read. */
export type UiLink = UiLinkArray | UiLinkObject;

/** A widget backing an input slot, when the UI records the association. */
export interface UiWidgetRef {
  readonly name: string;
}

/** One input slot on a UI-format node. */
export interface UiNodeInput {
  readonly name: string;
  readonly type: string;
  readonly link: number | null;
  readonly widget?: UiWidgetRef;
}

/** One output slot on a UI-format node. */
export interface UiNodeOutput {
  readonly name: string;
  readonly type: string;
  readonly slot_index?: number;
  readonly links?: readonly number[] | null;
}

/** A single node in UI format (top level or inside a subgraph definition). */
export interface UiNode {
  readonly id: number | string;
  readonly type: string;
  readonly mode?: number;
  readonly title?: string;
  readonly inputs?: readonly UiNodeInput[];
  readonly outputs?: readonly UiNodeOutput[];
  readonly widgets_values?: readonly unknown[];
  readonly widgets_values_named?: Readonly<Record<string, unknown>>;
  readonly properties?: Readonly<Record<string, unknown>>;
}

/** Boundary pin on a subgraph definition (exposed widget or output). */
export interface SubgraphBoundaryPin {
  readonly name: string;
  readonly linkIds?: readonly number[];
}

/** One subgraph definition from `definitions.subgraphs[]`. */
export interface SubgraphDefinition {
  readonly id: string;
  readonly name?: string;
  readonly inputNode?: { readonly id: number | string };
  readonly outputNode?: { readonly id: number | string };
  readonly inputs?: readonly SubgraphBoundaryPin[];
  readonly outputs?: readonly SubgraphBoundaryPin[];
  readonly nodes?: readonly UiNode[];
  readonly links?: readonly UiLink[];
}

/** Saved UI-format workflow JSON (unknown-shape input; validated on entry). */
export interface UiWorkflow {
  readonly nodes?: readonly UiNode[];
  readonly links?: readonly UiLink[];
  readonly definitions?: {
    readonly subgraphs?: readonly SubgraphDefinition[];
  };
  readonly extra?: unknown;
}

/** One class entry of a pinned `/object_info` snapshot. */
export interface ObjectInfoClass {
  readonly input?: {
    readonly required?: Readonly<Record<string, readonly unknown[]>>;
    readonly optional?: Readonly<Record<string, readonly unknown[]>>;
  };
  /** Widget names in positional order (mirrors `/object_info` order). */
  readonly input_order?: {
    readonly required?: readonly string[];
    readonly optional?: readonly string[];
  };
  readonly output?: readonly unknown[];
  readonly output_name?: readonly string[];
}

/** Pinned `/object_info` snapshot: class name → shape. */
export type ObjectInfoSnapshot = Readonly<Record<string, ObjectInfoClass>>;

/** One flat API-format node. */
export interface ApiNode {
  readonly inputs: Record<string, unknown>;
  readonly class_type: string;
  readonly _meta?: {
    readonly title?: string;
    readonly cnr_id?: string;
    readonly ver?: string;
  };
}

/** Flat API-format graph: opaque string node id → node. */
export type ApiGraph = Record<string, ApiNode>;

/** A widget value that could not be mapped to an input — never dropped. */
export interface UnresolvedInput {
  readonly node: string;
  readonly input: string;
}

/** A consumer input pruned because its link source vanished. */
export interface PrunedDangling {
  readonly node: string;
  readonly input: string;
  readonly from: string;
}

/** Pack identity of one converted class, for `missingRequiredNodes` reuse. */
export interface PackIdentity {
  readonly class: string;
  readonly cnr_id?: string;
  readonly ver?: string;
}

/** Control/config classes whose instances the editor submits unreferenced. */
export const UNREFERENCED_LIVE_CLASSES: ReadonlySet<string> = new Set([
  "DaSiWaH3ContinuityPublish",
  "DaSiWa_NodeStatusSwitch",
  "ModelPatchTorchSettings",
  "ResolutionSelector",
],);

/** Converter report consumed by param derivation, probe scaffold, ingest. */
export interface ConverterReport {
  readonly mutedDropped: readonly string[];
  readonly bypassedDropped: readonly string[];
  readonly notesSkipped: readonly string[];
  readonly unresolvedInputs: readonly UnresolvedInput[];
  readonly prunedDangling: readonly PrunedDangling[];
  readonly packIdentity: readonly PackIdentity[];
  readonly nodeCount: number;
  /** Unreferenced-but-live control/config ids, computed from the converted graph. */
  readonly unreferencedLive: readonly string[];
}

/** Converter output: the submittable graph plus its report. */
export interface ConversionResult {
  readonly graph: ApiGraph;
  readonly report: ConverterReport;
}

/** Converter options. A single object per repo convention. */
export interface ConvertOptions {
  /**
   * Global-subgraph definitions by id (`GET /global_subgraphs`), inlined
   * when an instance references an id with no local definition.
   */
  readonly globalSubgraphs?: Readonly<Record<string, SubgraphDefinition>>;
  /**
   * Frontend-only widgets (`serialize === false` DOM widgets) per class.
   * Defaults cover the packs attested in fixture sources; override to extend.
   */
  readonly serializeFalseWidgets?: Readonly<Record<string, readonly string[]>>;
}

export type { ConverterFailure, } from "./errors";
export { ConverterError, } from "./errors";
