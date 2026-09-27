// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Canvas drawing helpers for the game canvas component — pure functions
 * over a 2D context. Labels are drawn via fillText only.
 * @module frontend/alpine/game-canvas/draw
 */

/** Entity token rendered on the grid. */
export interface GameCanvasEntity {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  color?: string;
  label?: string;
}

/** Item marker rendered as a diamond on the grid. */
export interface GameCanvasItem {
  id: string;
  name: string;
  x: number;
  y: number;
}

/** Latest-state API payload consumed by the canvas. */
export interface GameStateBody {
  messageId: string;
  createdAt: string;
  state: {
    grid: { width: number; height: number };
    entities: GameCanvasEntity[];
    items?: GameCanvasItem[];
    caption?: string;
  };
  analysis: {
    movements: { entityId: string; from: { x: number; y: number }; to: { x: number; y: number } }[];
    added: string[];
    removed: string[];
    caption?: string;
  };
}

/** Fill color fallback for entity kinds without a palette entry. */
const DEFAULT_COLOR = "#9ca3af";

export const KIND_COLORS: Record<string, string> = {
  pc: "#3b82f6",
  npc: "#22c55e",
  enemy: "#ef4444",
  object: "#9ca3af",
};

/**
 * Draw the empty/absent-state placeholder (no grid).
 * @param canvas - target canvas element
 * @param ctx - 2D context of `canvas`
 * @returns nothing
 */
export function drawPlaceholder(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D,): void {
  canvas.width = 320;
  canvas.height = 120;
  ctx.clearRect(0, 0, canvas.width, canvas.height,);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("No scene state yet", canvas.width / 2, canvas.height / 2,);
}

/**
 * Draw the full scene: grid lines, item diamonds, entity tokens with
 * fillText labels, optional caption.
 * @param ctx - 2D context of the canvas to draw onto
 * @param state - scene payload to render
 * @param cols - rendered column count (grid width, clamped)
 * @param rows - rendered row count (grid height, clamped)
 * @param cell - rendered cell size in px
 * @param selectedId - id of the selected entity, or null
 * @returns nothing
 */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  state: GameStateBody["state"],
  cols: number,
  rows: number,
  cell: number,
  selectedId: string | null,
): void {
  const { entities, items, caption, } = state;
  const canvas = ctx.canvas;
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  ctx.clearRect(0, 0, canvas.width, canvas.height,);

  // Grid lines.
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= cols; i++) {
    ctx.moveTo(i * cell + 0.5, 0,);
    ctx.lineTo(i * cell + 0.5, canvas.height,);
  }
  for (let j = 0; j <= rows; j++) {
    ctx.moveTo(0, j * cell + 0.5,);
    ctx.lineTo(canvas.width, j * cell + 0.5,);
  }
  ctx.stroke();

  // Items: small diamond markers.
  ctx.fillStyle = "#f59e0b";
  for (const item of items ?? []) {
    const ix = Math.min(Math.max(item.x, 0,), cols - 1,);
    const iy = Math.min(Math.max(item.y, 0,), rows - 1,);
    const px = (ix + 0.5) * cell;
    const py = (iy + 0.5) * cell;
    const r = Math.max(cell * 0.18, 3,);
    ctx.beginPath();
    ctx.moveTo(px, py - r,);
    ctx.lineTo(px + r, py,);
    ctx.lineTo(px, py + r,);
    ctx.lineTo(px - r, py,);
    ctx.closePath();
    ctx.fill();
  }

  // Entity tokens: filled circle + 11px sans label, clamped into the grid.
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  for (const e of entities) {
    const ex = Math.min(Math.max(e.x, 0,), cols - 1,);
    const ey = Math.min(Math.max(e.y, 0,), rows - 1,);
    const px = (ex + 0.5) * cell;
    const py = (ey + 0.5) * cell;
    const r = Math.max(cell * 0.3, 5,);
    ctx.fillStyle = e.color || KIND_COLORS[e.kind] || DEFAULT_COLOR;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2,);
    ctx.fill();
    if (selectedId === e.id) {
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = "#111827";
    ctx.fillText((e.name || e.label || e.id).slice(0, 12,), px, py + r + 11,);
  }

  if (caption) {
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "left";
    ctx.fillText(caption.slice(0, 80,), 4, canvas.height - 4,);
  }
}
