// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `[p]` mark collection: marked UI nodes → widget inputs to parameterize.
 *
 * A node whose `title` carries the `[p]` prefix exposes its unconnected
 * widget inputs; the mark is a `title` prefix so it survives the editor
 * save round-trip verbatim. Subgraph *instances* marked `[p]` expose their
 * boundary pins instead (the container's unlinked slots); inner-node marks
 * inside a subgraph definition apply to every instance of that definition.
 *
 * @module comfyui-params/marks
 */
import type { Brand, } from "../../utils/brands";
import { indexLinks, pinTargets, } from "../comfyui-converter/links";
import type { SubgraphDefinition, UiNode, UiWorkflow, } from "../comfyui-converter/types";

/** Title prefix selecting parameterized nodes. Must lead the title. */
export const MARK_PREFIX = "[p]";

/** Identity of a marked input: flat node id + widget input name. */
export type MarkedNodeId = Brand<string, "MarkedNodeId">;

/** One marked widget input and the value it currently holds. */
export interface MarkedInput {
  readonly nodeId: MarkedNodeId;
  readonly className: string;
  readonly inputName: string;
  readonly socketType: string;
  readonly defaultValue: unknown;
  readonly label: string | null;
  readonly targets: readonly MarkedTarget[];
}

/** One inner input a marked boundary pin fans out to (flat id + input). */
export interface MarkedTarget {
  readonly nodeId: string;
  readonly className: string;
  readonly inputName: string;
}

/** Options for {@link collectMarked}. */
export interface CollectMarksOptions {
  readonly workflow: UiWorkflow;
}

function markLabel(title: string,): string {
  return title.slice(MARK_PREFIX.length,).trim();
}

function isMarked(title: string | undefined,): title is string {
  return title !== undefined && title.startsWith(MARK_PREFIX,);
}

function unlinkedWidgets(node: UiNode,): Array<{ name: string; type: string; label: string | null }> {
  const out: Array<{ name: string; type: string; label: string | null }> = [];
  for (const slot of node.inputs ?? []) {
    if (slot.link !== null && slot.link !== undefined) { continue; }
    if (slot.widget === undefined) { continue; }
    const label = typeof (slot as { label?: unknown }).label === "string"
      ? (slot as unknown as { label: string }).label
      : null;

    out.push({ name: slot.widget.name, type: slot.type, label, },);
  }

  return out;
}

function namedDefault(node: UiNode, name: string, index: number,): unknown {
  const named = node.widgets_values_named ?? {};
  if (name in named) { return named[name]; }
  return node.widgets_values?.[index];
}

/** Options for {@link pinTargetsOf}. */
interface PinTargetsOptions {
  readonly definition: SubgraphDefinition;
  readonly instanceId: string;
  readonly pinName: string;
}

function pinTargetsOf(options: PinTargetsOptions,): MarkedTarget[] {
  const { definition, instanceId, pinName, } = options;
  const pin = (definition.inputs ?? []).find((entry,) => entry.name === pinName);
  if (pin === undefined) { return []; }
  const innerLinks = indexLinks(definition.links ?? [],);
  const inputNodeId = definition.inputNode === undefined ? "-10" : String(definition.inputNode.id,);
  const innerById = new Map((definition.nodes ?? []).map((node,) => [String(node.id,), node,]),);
  const targets: MarkedTarget[] = [];
  for (const link of pinTargets(pin, innerLinks, inputNodeId,)) {
    const inner = innerById.get(link.targetId,);
    const slot = inner?.inputs?.[link.targetSlot];
    if (inner === undefined || slot === undefined) { continue; }
    targets.push({
      nodeId: `${instanceId}:${link.targetId}`,
      className: inner.type,
      inputName: slot.widget?.name ?? slot.name,
    },);
  }

  return targets;
}

function definitionsOf(workflow: UiWorkflow,): ReadonlySet<string> {
  return new Set((workflow.definitions?.subgraphs ?? []).map((definition,) => definition.id),);
}

function pushNodeMarks(node: UiNode, flatId: string, into: MarkedInput[],): void {
  if (!isMarked(node.title,)) { return; }
  const label = markLabel(node.title,);
  let position = 0;
  for (const slot of unlinkedWidgets(node,)) {
    into.push({
      nodeId: flatId as MarkedNodeId,
      className: node.type,
      inputName: slot.name,
      socketType: slot.type,
      defaultValue: namedDefault(node, slot.name, position,),
      label: label === "" ? (slot.label ?? slot.name) : label,
      targets: [],
    },);

    position += 1;
  }
}

/**
 * Collect every marked widget input in a UI workflow.
 * @param options - Workflow to scan
 * @returns Marked inputs in scan order (top level, then definition order)
 */
export function collectMarked(options: CollectMarksOptions,): MarkedInput[] {
  const { workflow, } = options;
  const marked: MarkedInput[] = [];
  for (const node of workflow.nodes ?? []) {
    if (definitionsOf(workflow,).has(node.type,)) { continue; }
    pushNodeMarks(node, String(node.id,), marked,);
  }

  const definitions = new Map((workflow.definitions?.subgraphs ?? []).map((def,) => [def.id, def,]),);
  const instances = new Map<string, UiNode>();
  for (const node of workflow.nodes ?? []) {
    if (definitions.has(node.type,)) { instances.set(node.type, node,); }
  }

  for (const definition of workflow.definitions?.subgraphs ?? []) {
    const instance = instances.get(definition.id,);
    if (instance !== undefined && isMarked(instance.title,)) {
      const label = markLabel(instance.title,);
      const named = instance.widgets_values_named ?? {};
      (instance.inputs ?? []).forEach((slot, slotIndex,) => {
        if (slot.link !== null && slot.link !== undefined) { return; }
        if (slot.widget === undefined) { return; }
        const value = slot.widget.name in named ? named[slot.widget.name] : instance.widgets_values?.[slotIndex];
        marked.push({
          nodeId: `${String(instance.id,)}:${slot.widget.name}` as MarkedNodeId,
          className: `subgraph:${definition.id}:${slot.widget.name}`,
          inputName: slot.widget.name,
          socketType: slot.type,
          defaultValue: value,
          label: label === "" ? slot.widget.name : `${label} ${slot.widget.name}`,
          targets: pinTargetsOf({ definition, instanceId: String(instance.id,), pinName: slot.widget.name, },),
        },);
      },);
    }

    for (const inner of definition.nodes ?? []) {
      if (!isMarked(inner.title,)) { continue; }
      const owner = instances.get(definition.id,);
      const flatId = owner === undefined ? String(inner.id,) : `${String(owner.id,)}:${String(inner.id,)}`;
      pushNodeMarks(inner, flatId, marked,);
    }
  }

  return marked;
}
