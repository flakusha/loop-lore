// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Knowledge-graph panel (admin analytics tab) — FEA-2026-058 ──

import { t, } from "./i18n";

interface KnowledgeNodeRaw {
  id: string;
  kind: "asset" | "entity";
  label: string;
}

interface KnowledgeEdgeRaw {
  source: string;
  target: string;
  label: string | null;
}

interface KnowledgeGraphResponse {
  nodes?: KnowledgeNodeRaw[];
  edges?: KnowledgeEdgeRaw[];
}

/** A graph node projected onto the SVG circle layout. */
interface GraphNode {
  id: string;
  label: string;
  kind: "asset" | "entity";
  x: number;
  y: number;
  fill: string;
}

/** A graph edge projected between laid-out node coordinates. */
interface GraphEdge {
  source: string;
  target: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** SVG viewBox geometry for the circle layout. */
const KG_VIEW = 400;
const KG_RADIUS = 150;
const KG_CENTER = KG_VIEW / 2;

const KG_FILL: Record<KnowledgeNodeRaw["kind"], string> = {
  asset: "var(--success)",
  entity: "var(--warning)",
};

/**
 * Project raw nodes/edges onto a circular layout.
 *
 * @param nodes - Raw graph nodes from the knowledge-graph endpoint.
 * @param edges - Raw graph edges from the knowledge-graph endpoint.
 * @returns Positioned nodes and edges ready for SVG rendering.
 */
export function projectKnowledgeGraph(
  nodes: KnowledgeNodeRaw[],
  edges: KnowledgeEdgeRaw[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const angleStep = nodes.length > 0 ? (Math.PI * 2) / nodes.length : 0;
  const positioned = new Map<string, GraphNode>(
    nodes.map((n, i,) => {
      const angle = i * angleStep - Math.PI / 2;
      return [
        n.id,
        {
          id: n.id,
          label: n.label,
          kind: n.kind,
          x: KG_CENTER + KG_RADIUS * Math.cos(angle,),
          y: KG_CENTER + KG_RADIUS * Math.sin(angle,),
          fill: KG_FILL[n.kind] ?? "var(--text-muted)",
        },
      ];
    },),
  );

  const laidEdges = edges.flatMap((e,) => {
    const a = positioned.get(e.source,);
    const b = positioned.get(e.target,);
    if (!a || !b) { return []; }
    return [{ source: e.source, target: e.target, x1: a.x, y1: a.y, x2: b.x, y2: b.y, },];
  },);

  return { nodes: [...positioned.values(),], edges: laidEdges, };
}

/** Knowledge-graph panel state + loader for the admin analytics tab. */
export const adminKnowledgeGraph = {
  kgNodes: [] as GraphNode[],
  kgEdges: [] as GraphEdge[],
  loadingKnowledgeGraph: false,

  /**
   * Fetch the knowledge graph and project it onto the SVG circle layout.
   *
   * @throws Never rejects; failures surface as an error toast.
   */
  async loadKnowledgeGraph() {
    if (this.loadingKnowledgeGraph) { return; }
    this.loadingKnowledgeGraph = true;
    try {
      const res = await apiFetch("/api/v1/memory/knowledge-graph", {
        headers: { Accept: "application/json", },
      },);

      if (!res.ok) {
        showToast("error", t("toasts.failedLoadKnowledgeGraph",),);
        return;
      }

      const data = await res.json() as KnowledgeGraphResponse;
      const { nodes, edges, } = projectKnowledgeGraph(data.nodes ?? [], data.edges ?? [],);

      this.kgNodes = nodes;
      this.kgEdges = edges;
    } catch {
      showToast("error", t("toasts.networkError",),);
    } finally {
      this.loadingKnowledgeGraph = false;
    }
  },
};
