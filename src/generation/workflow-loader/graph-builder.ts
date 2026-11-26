// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  type UiLinkArray,
  type UiNode,
  type UiNodeInput,
  type UiNodeOutput,
  type UiWorkflow,
} from "../comfyui-converter/types";
import { allocateNodeId, } from "../node-id";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import { assertGeneratedGraph, } from "./generated-validation";

/** Options for constructing a {@link Graph}. */
export interface GraphOptions {
  /** Ids already claimed elsewhere; allocated node ids never collide with these. */
  readonly reservedIds?: Iterable<string>;
}

/** Caller-supplied embedding metadata for {@link Graph.finish}. */
export interface GraphFinishOptions {
  /** Key under `workflow.extra` that holds the embedded prompt. */
  readonly embeddingKey: string;
  /** Schema identifier recorded alongside the embedded prompt. */
  readonly schemaId: string;
}

/** The two complementary views of a finished graph. */
export interface GraphResult {
  /** UI-format workflow: nodes, links and the embedded prompt. */
  readonly workflow: UiWorkflow;
  /** Flat API-format prompt, keyed by opaque node id. */
  readonly prompt: ComfyUIWorkflow;
}

interface PendingNode {
  readonly classType: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly inputs: UiNodeInput[];
  readonly outputs: UiNodeOutput[];
  readonly apiInputs: Record<string, unknown>;
}

/**
 * Incremental, model-agnostic builder for paired UI/API ComfyUI graphs.
 *
 * Node ids are opaque strings allocated through `allocateNodeId`; widget values
 * and wired links are mirrored into both representations. No model-specific
 * class names or embedding keys are baked in — callers name those at `finish`.
 */
export class Graph {
  private readonly reservedIds: readonly string[];
  private readonly nodes = new Map<string, PendingNode>();
  private readonly links: UiLinkArray[] = [];
  private nextLinkId = 1;

  /** @param options - Optional pre-reserved node ids. */
  constructor(options?: GraphOptions,) {
    this.reservedIds = options?.reservedIds ? [...options.reservedIds,] : [];
  }

  /**
   * Add a node and return its freshly allocated opaque id.
   *
   * @param classType - ComfyUI node class name.
   * @param values - Initial widget values, mirrored to UI and API node inputs.
   * @returns The new node id.
   */
  add(classType: string, values: Readonly<Record<string, unknown>> = {},): string {
    const id = allocateNodeId([...this.reservedIds, ...this.nodes.keys(),],);
    this.nodes.set(id, {
      classType,
      values: { ...values, },
      inputs: [],
      outputs: [],
      apiInputs: { ...values, },
    },);

    return id;
  }

  /**
   * Connect a source node's output slot to a named input on a target node.
   *
   * @param source - Id of the producing node.
   * @param slot - Index of the source output slot.
   * @param target - Id of the consuming node.
   * @param name - Input name on the target node.
   * @throws If either id is unknown or the target input is already wired.
   */
  wire(source: string, slot: number, target: string, name: string,): void {
    const src = this.nodes.get(source,);
    if (!src) { throw new Error(`Unknown source node: ${source}`,); }
    const tgt = this.nodes.get(target,);
    if (!tgt) { throw new Error(`Unknown target node: ${target}`,); }
    if (tgt.inputs.some((input,) => input.name === name)) {
      throw new Error(`Input already wired: ${target}.${name}`,);
    }

    const linkId = this.nextLinkId++;
    const targetSlot = tgt.inputs.length;
    this.links.push([linkId, source, slot, target, targetSlot, "",],);
    tgt.inputs.push({ name, type: "", link: linkId, },);
    src.outputs.push({ name, type: "", slot_index: slot, links: [linkId,], },);
    tgt.apiInputs[name] = [source, slot,];
  }

  /**
   * Materialise fresh UI and API graphs from the current builder state.
   *
   * @param options - Embedding key and schema id stored under `workflow.extra`.
   * @returns Independent `workflow`/`prompt` objects the caller may freely mutate.
   */
  finish(options: GraphFinishOptions,): GraphResult {
    const nodes: UiNode[] = [];
    const prompt: ComfyUIWorkflow = {};
    for (const [id, node,] of this.nodes) {
      nodes.push({
        id,
        type: node.classType,
        inputs: [...node.inputs,],
        outputs: [...node.outputs,],
        widgets_values_named: { ...node.values, },
        widgets_values: Object.values(node.values,),
      },);

      prompt[id] = {
        inputs: { ...node.apiInputs, },
        class_type: node.classType,
        _meta: { title: node.classType, },
      };
    }

    assertGeneratedGraph(prompt,);

    return {
      workflow: {
        nodes,
        links: [...this.links,],
        extra: {
          [options.embeddingKey]: {
            schema: options.schemaId,
            executablePrompt: structuredClone(prompt,),
          },
        },
      },
      prompt,
    };
  }
}
