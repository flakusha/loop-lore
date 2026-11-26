// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Template-list projection: backend/category filtering plus per-template node
 * availability, kept out of the route so the HTTP layer stays thin.
 * @module template-list
 */

import { templateAvailability, } from "./node-availability";
import type {
  NodeDiscovery,
  NodeDiscoverySummary,
  TemplateAvailability,
} from "./node-availability";
import type { TemplateRegistry, } from "./template-registry";
import type { ImageEditBackend, WorkflowTemplate, } from "./types";

/** Summary served by `GET /templates`: the template without its build function. */
export type TemplateSummary = Omit<WorkflowTemplate, "build"> & {
  availability: TemplateAvailability;
};

/** Parsed query parameters of the template route. */
export interface TemplateListQuery {
  backend: ImageEditBackend | null;
  category: string | null;
}

/** Injected seams: discovery is the provider's cached `/object_info` result. */
export interface TemplateListDeps {
  registry: TemplateRegistry;
  discover: () => Promise<NodeDiscovery>;
}

/** Shape of the template route's success response. */
export interface TemplateListResult {
  data: TemplateSummary[];
  node_discovery: NodeDiscoverySummary;
}

/**
 * Build the documented template response. Templates are never hidden; each
 * carries `availability: { available, status }` and, for `missing_nodes`, the
 * absent node names. `node_discovery.status` is `unreachable` only when
 * ComfyUI did not answer; a reachable server with zero nodes reports `ok`
 * with `node_count: 0`. Backends other than comfyui are `not_checked`.
 * @param query - Backend/category filters from the request URL
 * @param deps - Registry and node-discovery seam
 * @returns the response body
 */
export async function buildTemplateList(
  query: TemplateListQuery,
  deps: TemplateListDeps,
): Promise<TemplateListResult> {
  const { backend, category, } = query;
  const { registry, discover, } = deps;

  let templates: WorkflowTemplate[];
  if (backend && category) {
    templates = registry.listForBackend(backend,).filter((t,) => t.category === category);
  } else if (backend) {
    templates = registry.listForBackend(backend,);
  } else if (category) {
    templates = registry.listByCategory(category as WorkflowTemplate["category"],);
  } else {
    templates = registry.listAll();
  }

  let discovery: NodeDiscovery | null = null;
  let allowedIds: Set<string> | null = null;
  if (backend === "comfyui") {
    discovery = await discover();
    if (discovery.reachable) {
      // Single source of truth for the backend + required-node decision.
      allowedIds = new Set(
        registry.listAvailable("comfyui", discovery.nodes,).map((t,) => t.id),
      );
    }
  }

  const nodeDiscovery: NodeDiscoverySummary = discovery
    ? {
      status: discovery.reachable ? "ok" : "unreachable",
      node_count: discovery.nodes.size,
    }
    : { status: "not_checked", node_count: 0, };

  const data = templates.map(({ build: _build, ...rest },) => ({
    ...rest,
    availability: templateAvailability(rest, backend, discovery, allowedIds,),
  }));

  return { data, node_discovery: nodeDiscovery, };
}
