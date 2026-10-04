// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Static graph validation for the builder validate endpoint — no ComfyUI
 * round-trip. Accepts the API-format record (node id -> {class_type,
 * inputs}) or an array of node objects with explicit `id` fields; the array
 * form is where duplicate ids are detectable (JSON object keys cannot
 * collide after parsing).
 *
 * Checks: node shape, duplicate ids, link sources that resolve ("missing
 * input"), acyclicity over `[nodeId, slot]` edges, and the dead-node sink
 * rule reused from `workflow-loader/workflow-validation` (a node nothing
 * links *from* is dead unless its class is a terminal sink).
 */
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import { findDeadNodes, } from "../workflow-loader/workflow-validation";

/** Machine-readable issue classes. */
export type GraphIssueKind =
  | "invalid_shape"
  | "duplicate_id"
  | "missing_input"
  | "cycle"
  | "dead_node";

/** One validation finding. */
export interface GraphIssue {
  kind: GraphIssueKind;
  message: string;
}

/** Outcome of validating an untrusted graph. */
export interface GraphValidation {
  ok: boolean;
  issues: GraphIssue[];
}

interface NormalizedNode {
  id: string;
  classType: unknown;
  inputs: Record<string, unknown> | null;
}

/**
 * A `[nodeId, slot]` link — same probe family as the sink rule uses.
 * @param value - raw input value from a node's `inputs` map
 * @returns `true` when `value` is a `[nodeId, slot]` edge tuple.
 */
function isEdge(value: unknown,): value is [string, number,] {
  return Array.isArray(value,) && typeof value[0] === "string" && typeof value[1] === "number";
}

/**
 * Normalize the record/array input forms into one node list.
 * @param value - raw workflow payload (node record or node array)
 * @param issues - collector for shape/duplicate errors found while normalizing
 * @returns the normalized nodes; empty when the payload is not an object.
 */
function normalizeNodes(value: unknown, issues: GraphIssue[],): NormalizedNode[] {
  if (typeof value !== "object" || value === null) {
    issues.push({ kind: "invalid_shape", message: "workflow must be an object or node array", },);
    return [];
  }

  const nodes: NormalizedNode[] = [];
  if (Array.isArray(value,)) {
    const seenIds = new Set<string>();
    for (const [index, entry,] of value.entries()) {
      if (typeof entry !== "object" || entry === null) {
        issues.push({ kind: "invalid_shape", message: `nodes[${index}] must be an object`, },);
        continue;
      }

      const node = entry as Record<string, unknown>;
      if (typeof node.id !== "string" || node.id.length === 0) {
        issues.push({ kind: "invalid_shape", message: `nodes[${index}] requires a non-empty id`, },);
        continue;
      }

      if (seenIds.has(node.id,)) {
        issues.push({ kind: "duplicate_id", message: `duplicate node id ${node.id}`, },);
        continue;
      }

      seenIds.add(node.id,);
      nodes.push(normalizeNode(node.id, node,),);
    }

    return nodes;
  }

  for (const [id, entry,] of Object.entries(value as Record<string, unknown>,)) {
    if (typeof entry !== "object" || entry === null) {
      issues.push({ kind: "invalid_shape", message: `node ${id} must be an object`, },);
      continue;
    }

    nodes.push(normalizeNode(id, entry as Record<string, unknown>,),);
  }

  return nodes;
}

function normalizeNode(id: string, node: Record<string, unknown>,): NormalizedNode {
  const inputs = typeof node.inputs === "object" && node.inputs !== null && !Array.isArray(node.inputs,)
    ? node.inputs as Record<string, unknown>
    : null;

  return { id, classType: node.class_type, inputs, };
}

/**
 * Report missing class_type/inputs and return the edges of a node list.
 * @param nodes - normalized nodes to inspect
 * @param issues - collector for invalid-shape/missing-input errors
 * @returns the edge list plus the API-format workflow record.
 */
function inspectNodes(
  nodes: NormalizedNode[],
  issues: GraphIssue[],
): { edges: Array<{ from: string; to: string }>; record: ComfyUIWorkflow } {
  const edges: Array<{ from: string; to: string }> = [];
  const record: ComfyUIWorkflow = {};
  for (const node of nodes) {
    if (typeof node.classType !== "string" || node.classType.length === 0) {
      issues.push({ kind: "invalid_shape", message: `node ${node.id}: missing class_type`, },);
    }

    if (!node.inputs) {
      issues.push({ kind: "missing_input", message: `node ${node.id}: missing inputs`, },);
      record[node.id] = { inputs: {}, class_type: String(node.classType ?? "",), };
      continue;
    }

    for (const value of Object.values(node.inputs,)) {
      if (!isEdge(value,)) { continue; }
      const [source,] = value;
      edges.push({ from: source, to: node.id, },);
    }

    record[node.id] = { inputs: node.inputs, class_type: String(node.classType ?? "",), };
  }

  return { edges, record, };
}

/**
 * Links that name a node id which does not exist in the graph.
 * @param edges - discovered edges
 * @param known - ids present in the graph
 * @returns one `missing_input` issue per unknown source id (deduplicated).
 */
function missingSourceIssues(
  edges: Array<{ from: string; to: string }>,
  known: Set<string>,
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const reported = new Set<string>();
  for (const edge of edges) {
    if (known.has(edge.from,) || reported.has(edge.from,)) { continue; }
    reported.add(edge.from,);
    issues.push({ kind: "missing_input", message: `input links to unknown node ${edge.from}`, },);
  }

  return issues;
}

/**
 * Kahn sweep: any node left with indegree > 0 sits on a cycle.
 * @param nodes - normalized nodes
 * @param edges - discovered edges
 * @returns one `cycle` issue listing the stuck node ids, or none when acyclic.
 */
function cycleIssues(nodes: NormalizedNode[], edges: Array<{ from: string; to: string }>,): GraphIssue[] {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) { indegree.set(node.id, 0,); }
  for (const edge of edges) {
    if (!indegree.has(edge.to,) || !indegree.has(edge.from,)) { continue; }
    indegree.set(edge.to, (indegree.get(edge.to,) ?? 0) + 1,);
    const targets = outgoing.get(edge.from,) ?? [];
    targets.push(edge.to,);
    outgoing.set(edge.from, targets,);
  }

  const queue = [...indegree.entries(),].filter(([_, degree,],) => degree === 0).map(([id,],) => id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift() as string;
    visited += 1;
    for (const target of outgoing.get(id,) ?? []) {
      const next = (indegree.get(target,) ?? 0) - 1;
      indegree.set(target, next,);
      if (next === 0) { queue.push(target,); }
    }
  }

  if (visited === indegree.size) { return []; }
  const stuck = [...indegree.entries(),].filter(([_, degree,],) => degree > 0).map(([id,],) => id);
  return [{ kind: "cycle", message: `cycle detected among nodes: ${stuck.join(", ",)}`, },];
}

/**
 * Statically validate an untrusted ComfyUI graph.
 * @param value - API-format record or array of `{id, class_type, inputs}` nodes
 * @returns issues; `ok` is true when none were found
 */
export function validateGraph(value: unknown,): GraphValidation {
  const issues: GraphIssue[] = [];
  const nodes = normalizeNodes(value, issues,);
  if (nodes.length === 0 && issues.length === 0) {
    issues.push({ kind: "invalid_shape", message: "workflow has no nodes", },);
    return { ok: false, issues, };
  }

  const { edges, record, } = inspectNodes(nodes, issues,);
  const known = new Set(nodes.map((node,) => node.id),);
  issues.push(...missingSourceIssues(edges, known,),);
  issues.push(...cycleIssues(nodes, edges,),);
  for (const id of findDeadNodes(record,)) {
    issues.push({ kind: "dead_node", message: `dead node not linked into the graph: ${id}`, },);
  }

  return { ok: issues.length === 0, issues, };
}
