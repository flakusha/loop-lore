// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Offline build: operator UI saves → shipped API-format graphs.
 *
 * The UI save under `configs/workflows/originals/` is the single
 * operator-maintained source. Conversion, `[p]` mark derivation and
 * placeholder injection are the reusable pure functions from
 * `comfyui-converter` / `comfyui-params`; this script only wires them,
 * carries dynamic-combo sub-widgets the converter cannot see, and writes
 * the generated files. No network, no DB, no live ComfyUI.
 *
 * @module scripts/build-workflow-api
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import {
  type ApiGraph,
  convertWorkflow,
  type ObjectInfoSnapshot,
  type UiWorkflow,
} from "../src/generation/comfyui-converter/index";
import { deriveParameters, } from "../src/generation/comfyui-params/derive";
import { injectPlaceholders, } from "../src/generation/comfyui-params/inject";
import { MARK_PREFIX, } from "../src/generation/comfyui-params/marks";
import { applyNodeOverrides, } from "../src/generation/workflow-substitutor";
import type { TemplateParameter, } from "../src/image-edit/types";

/** Pinned shared fixture; never written by this script. */
const RUNTIME_SNAPSHOT = "src/generation/comfyui-converter/fixtures/object-info.json";

/** Catalog-only class specs, merged over the shared fixture. */
export const DEFAULT_OVERLAY = "configs/workflow-object-info/object-info.catalog-overlay.json";

/** Default input and output directories (repo-root relative). */
export const ORIGINALS_DIR = "configs/workflows/originals";
const DEFAULT_OUT_DIR = "configs/workflows";

/**
 * Empty UI saves with no API counterpart. Listed explicitly so an empty
 * original can never be mistaken for a successful conversion.
 */
export const EMPTY_GRAPH_POLICY: Readonly<Record<string, string>> = {
  "minimax-h3-audio": "empty UI save: audio workflow not authored yet",
  "minimax-h3-assemble": "empty UI save: fragment assembly workflow not authored yet",
  "minimax-h3-image": "empty UI save: standalone H3 image workflow not authored yet",
  "minimax-h3-video-i2v": "empty UI save: H3 i2v workflow not authored yet",
  "minimax-h3-video-t2v": "empty UI save: H3 t2v workflow not authored yet",
  "qwen-edit": "empty UI save: Qwen edit workflow not authored yet",
};

/**
 * Converter drops COMFY_DYNAMICCOMBO_V3 sub-widgets (`widgets.ts` named-first
 * `widgetOrder` filter). Carry only values actually present in each UI save.
 */
const DYNAMIC_COMBO_FIELDS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  anima: { "1": ["format", "format.bit_depth", "format.input_color_space", "format.channels",], },
  illustrious: { "1": ["format", "format.bit_depth", "format.input_color_space", "format.channels",], },
  krea2: { "1": ["format", "format.bit_depth", "format.input_color_space", "format.channels",], },
  moss: { "1": ["format", "format.bit_depth", "format.input_color_space", "format.channels",], },
  noob: { "1": ["format", "format.bit_depth", "format.input_color_space", "format.channels",], },
  "qwen-image-2-1-image-edit": {
    "461": ["format", "format.bit_depth", "format.input_color_space", "format.channels",],
  },
  "qwen-image-2-1-t2i": {
    "461": ["format", "format.bit_depth", "format.input_color_space", "format.channels",],
  },
  sdxl: { "1": ["format", "format.bit_depth", "format.input_color_space", "format.channels",], },
  "minimax-h3-image-image-edit": {
    "48": ["resize_type", "resize_type.multiple",],
    "56": ["resize_type", "resize_type.megapixels",],
  },
  "minimax-h3-video-fl2va": { "92": ["format", "format.codec", "codec",], },
  "minimax-h3-video-fl2va-opt": { "92": ["format", "format.codec", "codec",], },
  "minimax-h3-video-ref2va": { "92": ["format", "format.codec", "codec",], },
  "minimax-h3-video-ref2va-opt": { "92": ["format", "format.codec", "codec",], },
};

/**
 * H3 video UI saves carry the finished prompt as a literal widget value, so
 * `[p]` derivation cannot bind `{{prompt}}`. Keep the shipped prompt contract
 * by binding it explicitly when generating these two graphs.
 */
const PROMPT_BINDINGS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  "minimax-h3-video-fl2va": { "161": ["prompt",], },
  "minimax-h3-video-fl2va-opt": { "161": ["prompt",], },
  "minimax-h3-video-ref2va": { "138": ["value",], },
  "minimax-h3-video-ref2va-opt": { "138": ["value",], },
};

/** Options shared by CLI and tests. */
export interface BuildOptions {
  readonly originalsDir: string;
  readonly outDir: string;
  readonly overlayPath: string;
}

export interface BuiltWorkflow {
  readonly id: string;
  readonly graph: ApiGraph;
  readonly parameters: readonly TemplateParameter[];
}

export interface BuildResult {
  readonly built: readonly BuiltWorkflow[];
  readonly excluded: readonly { readonly id: string; readonly reason: string }[];
}

/** Load the pinned snapshot plus the catalog class overlay (both read-only). */
export function loadSnapshot(overlayPath: string = DEFAULT_OVERLAY,): ObjectInfoSnapshot {
  const base = JSON.parse(readFileSync(RUNTIME_SNAPSHOT, "utf8",),) as ObjectInfoSnapshot;
  const overlay = JSON.parse(readFileSync(overlayPath, "utf8",),) as ObjectInfoSnapshot;
  return { ...base, ...overlay, };
}

/** Strip the mark prefix from converter-carried node titles. */
function cleanTitle(title: string | undefined,): string | undefined {
  if (title === undefined || !title.startsWith(MARK_PREFIX,)) { return title; }
  return title.slice(MARK_PREFIX.length,).trim();
}

/** Restore derived `{{name}}` overrides through the shared injection helper. */
function applyDerived(graph: ApiGraph, derived: ReadonlyMap<string, Readonly<Record<string, string>>>,): ApiGraph {
  const bindings = [...derived,].flatMap(([nodeId, fields,],) =>
    Object.entries(fields,).map(([inputName, value,],) => ({
      nodeId,
      inputName,
      parameterName: value.slice(2, -2,),
    }))
  );
  return injectPlaceholders({ graph, bindings, },);
}

/** Add converter-dropped dynamic-combo values from the UI save itself. */
function applyDynamicCombos(id: string, workflow: UiWorkflow, graph: ApiGraph,): ApiGraph {
  const nodes = new Map((workflow.nodes ?? []).map((node,) => [String(node.id,), node,]),);
  const overrides = new Map<string, Record<string, unknown>>();
  for (const [nodeId, fields,] of Object.entries(DYNAMIC_COMBO_FIELDS[id] ?? {},)) {
    const node = nodes.get(nodeId,);
    for (const field of fields) {
      const value = node?.widgets_values_named?.[field];
      if (value === undefined) {
        throw new Error(`${id}: dynamic-combo value ${nodeId}.${field} missing from UI save`,);
      }
      const target = overrides.get(nodeId,) ?? {};
      target[field] = value;
      overrides.set(nodeId, target,);
    }
  }

  return applyNodeOverrides(graph, overrides,);
}

/** Bind `{{prompt}}` on graphs whose UI save has no `[p]` mark for it. */
function applyPromptBindings(id: string, graph: ApiGraph,): ApiGraph {
  const overrides = new Map<string, Record<string, unknown>>();
  for (const [nodeId, fields,] of Object.entries(PROMPT_BINDINGS[id] ?? {},)) {
    overrides.set(nodeId, Object.fromEntries(fields.map((field,) => [field, "{{prompt}}",]),),);
  }
  return overrides.size === 0 ? graph : applyNodeOverrides(graph, overrides,);
}

/** ponytail: UI saves carry a literal attention string; per-class map if more appear. */
function bindAttentionLiterals(graph: ApiGraph,): ApiGraph {
  const overrides = new Map<string, Record<string, unknown>>();
  for (const [nodeId, node,] of Object.entries(graph,)) {
    const inputs = node.inputs as Record<string, unknown> | undefined;
    if (inputs?.attention === "comfy kitchen attention") {
      overrides.set(nodeId, { attention: "{{attention}}", },);
    }
  }
  return overrides.size === 0 ? graph : applyNodeOverrides(graph, overrides,);
}

/** Convert one UI save into an API graph plus its derived parameters. */
export function buildWorkflowGraph(
  id: string,
  workflow: UiWorkflow,
  snapshot: ObjectInfoSnapshot,
): BuiltWorkflow {
  const { graph: converted, } = convertWorkflow(workflow, snapshot,);
  const derived = deriveParameters({ workflow, converted, workflowId: id, snapshot, },);
  let graph = applyDerived(converted, derived.overrides,);
  graph = applyDynamicCombos(id, workflow, graph,);
  graph = applyPromptBindings(id, graph,);
  graph = bindAttentionLiterals(graph,);
  // ponytail: operator export carries an unwired ImageCompare node; drop it
  // here only. Upgrade to a per-graph dead-node allowlist if another appears.
  if (id === "minimax-h3-image-image-edit") { delete (graph as unknown as Record<string, unknown>)["62"]; }
  const titled: ApiGraph = {};
  for (const [nodeId, node,] of Object.entries(graph,)) {
    titled[nodeId] = {
      ...node,
      ...(node._meta === undefined ? {} : { _meta: { ...node._meta, title: cleanTitle(node._meta.title,), }, }),
    };
  }

  return { id, graph: titled, parameters: derived.parameters, };
}

/** Build every non-empty original; report empty stubs explicitly. */
export function buildAll(options: BuildOptions,): BuildResult {
  const snapshot = loadSnapshot(options.overlayPath,);
  const files = readdirSync(options.originalsDir,).filter((name,) => name.endsWith("-wf.json",)).sort();
  const built: BuiltWorkflow[] = [];
  const excluded: Array<{ id: string; reason: string }> = [];
  for (const file of files) {
    const id = file.slice(0, -"-wf.json".length,);
    const workflow = JSON.parse(readFileSync(join(options.originalsDir, file,), "utf8",),) as UiWorkflow;
    if ((workflow.nodes ?? []).length === 0) {
      const reason = EMPTY_GRAPH_POLICY[id];
      if (reason === undefined) { throw new Error(`${id}: unexpected empty UI save`,); }
      excluded.push({ id, reason, },);
      continue;
    }

    built.push(buildWorkflowGraph(id, workflow, snapshot,),);
  }

  return { built, excluded, };
}

interface CliArgs {
  readonly outDir: string;
  readonly overlayPath: string;
}

/** Parse the two build-time knobs; both default to repo paths. */
function parseArgs(argv: readonly string[],): CliArgs {
  let outDir = DEFAULT_OUT_DIR;
  let overlayPath = DEFAULT_OVERLAY;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--out" || flag === "--snapshot") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--",)) {
        throw new Error(`${flag} requires a directory/path`,);
      }
      if (flag === "--out") { outDir = value; }
      else { overlayPath = value; }
      index += 1;
      continue;
    }

    throw new Error(`unknown argument: ${flag}`,);
  }

  return { outDir, overlayPath, };
}

/** CLI entry point. */
export function main(argv: readonly string[] = process.argv.slice(2,),): void {
  const { outDir, overlayPath, } = parseArgs(argv,);
  const result = buildAll({
    originalsDir: ORIGINALS_DIR,
    outDir,
    overlayPath,
  },);
  mkdirSync(outDir, { recursive: true, },);
  for (const { id, graph, } of result.built) {
    writeFileSync(join(outDir, `${id}-v1.json`,), `${JSON.stringify(graph, null, 2,)}\n`,);
  }
  for (const { id, reason, } of result.excluded) {
    console.warn(`EXCLUDED ${id}: ${reason}`,);
  }
  console.log(`built ${result.built.length} API graph(s); excluded ${result.excluded.length} empty stub(s)`,);
}

if (import.meta.main) { main(); }
