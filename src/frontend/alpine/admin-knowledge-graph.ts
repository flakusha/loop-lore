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

/** Escape a label for safe inclusion in SVG markup. */
function escapeXml(value: string,): string {
  return value
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}

function truncateLabel(label: string,): string {
  return label.length > 18 ? label.slice(0, 17,) + "…" : label;
}

/**
 * Build the inner SVG markup (edges first, then nodes) for the graph.
 *
 * Alpine's x-for cannot iterate inside an <svg> element (its <template>
 * wrapper would land in the SVG namespace and lose `.content`), so the
 * panel binds this markup with x-html instead.
 *
 * @param nodes - Positioned nodes from the circle layout.
 * @param edges - Laid-out edges from the circle layout.
 * @returns SVG inner markup, empty string for an empty graph.
 */
export function buildGraphSvg(nodes: GraphNode[], edges: GraphEdge[],): string {
  const lines = edges.map((e,) =>
    `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="currentColor"` +
    ` stroke-opacity="0.35" style="color: var(--text-secondary, #6b7280)"></line>`
  );

  const nodeMarks = nodes.map((n,) =>
    `<circle cx="${n.x}" cy="${n.y}" r="8" fill="${escapeXml(n.fill,)}">` +
    `<title>${escapeXml(n.label,)}</title></circle>` +
    `<text x="${n.x}" y="${n.y - 12}" text-anchor="middle" fill="var(--text-primary, #212529)"` +
    ` style="font-size: 9px">${escapeXml(truncateLabel(n.label,),)}</text>`
  );

  return [...lines, ...nodeMarks,].join("",);
}

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
  kgGraphSvg: "",
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
      this.kgGraphSvg = buildGraphSvg(nodes, edges,);
    } catch {
      showToast("error", t("toasts.networkError",),);
    } finally {
      this.loadingKnowledgeGraph = false;
    }
  },
};
