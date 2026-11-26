// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { escapeHtml, } from "../html-escape";
import { matchesKind, } from "./location-explorer-controls";

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  depth: number;
  kind: string | null;
  mobility_mode: string;
  current_route_id: string | null;
  travel_progress: number;
  children: TreeNode[];
}

export type BadgeMeta = readonly [name: string, stopCount: number, secondsPerUnit: number,];

export function formatTransportBadge(node: TreeNode, meta?: BadgeMeta,): string | null {
  if (!node.current_route_id || !meta) { return null; }
  // ponytail: loop routes are treated as linear — ETA stops at the last stop.
  const [name, stops, unit,] = meta;
  const span = Math.max(stops - 1, 1,);
  const secs = Math.max((span - Math.min(Math.max(node.travel_progress, 0,), span,)) * unit, 0,);
  return `${name} · ${Math.round((Math.min(Math.max(node.travel_progress, 0,), span,) / span) * 100,)}% · ETA ${
    secs <= 0
      ? "arriving"
      : secs < 60
      ? `${Math.ceil(secs,)}s`
      : secs < 3600
      ? `${Math.ceil(secs / 60,)}m`
      : `${Math.floor(secs / 3600,)}h ${Math.ceil((secs % 3600) / 60,)}m`
  }`;
}

export function renderTreeMarkup(nodes: TreeNode[], meta: Record<string, BadgeMeta>, filterKind = "",): string {
  const walk = (rows: TreeNode[],): string =>
    rows.map((n,) => {
      const children = walk(n.children,);
      if (!matchesKind(n, filterKind,) && !children) { return ""; }
      const badge = formatTransportBadge(n, meta[n.current_route_id ?? ""],);
      return `<li data-testid="fractal-tree-node" data-depth="${n.depth}" data-path="${
        escapeHtml(n.path,)
      }" data-kind="${escapeHtml(n.kind ?? "",)}">` +
        `<details open><summary style="padding-left:${n.depth * 18}px">${escapeHtml(n.name,)}` +
        (badge ? `<span class="badge" data-testid="fractal-transport-badge">${escapeHtml(badge,)}</span>` : "") +
        `<span class="muted">[${escapeHtml(n.mobility_mode,)}]</span></summary>${children}</details></li>`;
    },).join("",);

  return `<ul style="list-style:none;padding-left:0;margin:0">${walk(nodes,)}</ul>`;
}
