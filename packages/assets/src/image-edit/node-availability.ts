// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Node-discovery result and the template-availability contract shared by the
 * ComfyUI edit provider and the image-edit template route.
 * @module node-availability
 */

import type { WorkflowTemplate, } from "./types";

/** Result of one `/object_info` discovery pass. */
export interface NodeDiscovery {
  /** False when ComfyUI could not be reached; `nodes` is then empty. */
  reachable: boolean;
  /** Node class names advertised by ComfyUI (empty on failure or empty install). */
  nodes: Set<string>;
}

/** Why a template can or cannot run on the discovered backend. */
export type TemplateAvailabilityStatus =
  | "available"
  | "missing_nodes"
  | "unreachable"
  | "not_checked";

/** Per-template availability attached to every template summary. */
export interface TemplateAvailability {
  /** True only when discovery confirmed every required node is installed. */
  available: boolean;
  status: TemplateAvailabilityStatus;
  /** Required nodes absent from `/object_info`; only set for `missing_nodes`. */
  missing_nodes?: string[];
}

/** Process-wide discovery state reported alongside the template list. */
export interface NodeDiscoverySummary {
  status: "ok" | "unreachable" | "not_checked";
  node_count: number;
}

/** The only template fields availability depends on. */
export type AvailabilitySubject = Pick<WorkflowTemplate, "id" | "required_nodes">;

/**
 * Attach a deliberate availability verdict to a template summary.
 * `allowedIds` comes from `TemplateRegistry.listAvailable` — this function
 * never re-decides which templates are runnable, it only names missing nodes.
 * @param template - Template summary (build function already stripped)
 * @param backend - Requested backend, when node discovery applies
 * @param discovery - Cached discovery result, or null when not requested
 * @param allowedIds - Ids `listAvailable` accepted, or null when unreachable
 * @returns the per-template availability contract
 */
export function templateAvailability(
  template: AvailabilitySubject,
  backend: string | null,
  discovery: NodeDiscovery | null,
  allowedIds: Set<string> | null,
): TemplateAvailability {
  if (backend !== "comfyui" || !discovery) {
    return { available: true, status: "not_checked", };
  }

  if (!discovery.reachable) {
    return { available: false, status: "unreachable", };
  }

  if (allowedIds?.has(template.id,)) {
    return { available: true, status: "available", };
  }

  return {
    available: false,
    status: "missing_nodes",
    missing_nodes: template.required_nodes.filter((node,) => !discovery.nodes.has(node,)),
  };
}
