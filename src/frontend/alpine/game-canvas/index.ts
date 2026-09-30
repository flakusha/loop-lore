// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 2D Game Canvas — Alpine component rendering the chat's latest extracted
 * game state (see docs/spec/game-canvas.md §Canvas Rendering Rules).
 *
 * Registered on globalThis (NOT Alpine.data) so x-data="gameCanvas()"
 * resolves, mirroring src/frontend/alpine/chat/index.ts. Drawing helpers
 * live in ./draw (pure functions over a 2D context).
 */

import { apiFetch, } from "../htmx";
import { activeChatId, } from "../story-state/derived";
import { drawPlaceholder, drawScene, type GameCanvasEntity, type GameStateBody, } from "./draw";

const POLL_INTERVAL_MS = 15_000;
const MIN_CELL = 16;
const MAX_CELL = 48;
const MAX_RENDER_CELLS = 64;

/** Alpine component state shape for the game canvas partial. */
export interface GameCanvasComponent {
  chatId: string | null;
  gameState: GameStateBody | null;
  analysis: GameStateBody["analysis"] | null;
  selected: GameCanvasEntity | null;
  loading: boolean;
  error: string | null;
  init(): Promise<void>;
  destroy(): void;
  refresh(): Promise<void>;
  onCanvasClick(event: MouseEvent,): void;
  /** Locate the canvas element (raw closure scope has no Alpine $refs proxy). */
  _canvas(): HTMLCanvasElement | null;
  /** Redraw the canvas from the current gameState (private render pass). */
  _draw(): void;
  /** Cell size: floor(container width / grid width) clamped to 16–48 px. */
  _cellSize(canvas: HTMLCanvasElement,): number;
}

(globalThis as unknown as Record<string, unknown>).gameCanvas = function(): GameCanvasComponent {
  // Interval + visibilitychange listener handles, closed over so destroy()
  // can tear both down deterministically.
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let onVisibility: (() => void) | null = null;

  const component: GameCanvasComponent = {
    chatId: null,
    gameState: null,
    analysis: null,
    selected: null,
    loading: false,
    error: null,

    /**
     * @returns {Promise<void>}
     */
    init(): Promise<void> {
      onVisibility = () => {
        if (document.visibilityState === "visible") {
          void component.refresh();
        }
      };
      document.addEventListener("visibilitychange", onVisibility,);
      pollTimer = globalThis.setInterval(() => {
        if (document.visibilityState === "visible") {
          void component.refresh();
        }
      }, POLL_INTERVAL_MS,);
      return component.refresh();
    },

    /**
     * @returns {void}
     */
    destroy(): void {
      if (pollTimer !== null) {
        globalThis.clearInterval(pollTimer,);
        pollTimer = null;
      }
      if (onVisibility) {
        document.removeEventListener("visibilitychange", onVisibility,);
        onVisibility = null;
      }
    },

    /**
     * @returns {Promise<void>}
     */
    async refresh(): Promise<void> {
      const chatId = activeChatId();
      if (!chatId) { return; }
      component.chatId = chatId;
      component.loading = true;
      component.error = null;
      try {
        const res = await apiFetch(`/api/v1/chats/${chatId}/game-state`, {
          headers: { Accept: "application/json", },
        },);
        if (res.status === 404) {
          // No state yet for this chat — placeholder, not an error banner.
          component.gameState = null;
          component.analysis = null;
          component.selected = null;
        } else if (!res.ok) {
          component.error = `Game state load failed (${String(res.status,)})`;
        } else {
          const payload = await res.json() as GameStateBody;
          component.gameState = payload;
          component.analysis = payload.analysis ?? null;
          // Drop a stale selection if the entity vanished from the new state.
          if (component.selected && !payload.state.entities.some((e,) => e.id === component.selected?.id)) {
            component.selected = null;
          }
        }
      } catch (error) {
        component.error = error instanceof Error ? error.message : String(error,);
      } finally {
        component.loading = false;
        component._draw();
      }
    },

    /**
     * @param {MouseEvent} event
     * @returns {void}
     */
    onCanvasClick(event: MouseEvent,): void {
      const state = component.gameState;
      if (!state) { return; }
      const canvas = component._canvas();
      if (!canvas) { return; }
      const rect = canvas.getBoundingClientRect();
      const cell = component._cellSize(canvas,);
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      // Clamp to the same rendered bounds as _draw (grid clamped at 64 cells).
      const cols = Math.min(state.state.grid.width, MAX_RENDER_CELLS,);
      const rows = Math.min(state.state.grid.height, MAX_RENDER_CELLS,);
      // Nearest token whose center lies within half a cell of the click.
      let best: GameCanvasEntity | null = null;
      let bestDist = Infinity;
      for (const e of state.state.entities) {
        const ex = Math.min(Math.max(e.x, 0,), cols - 1,);
        const ey = Math.min(Math.max(e.y, 0,), rows - 1,);
        const dist = Math.hypot((ex + 0.5) * cell - px, (ey + 0.5) * cell - py,);
        if (dist < cell / 2 && dist < bestDist) {
          bestDist = dist;
          best = e;
        }
      }
      component.selected = best;
      component._draw();
    },

    /**
     * Cell size: floor(container width / grid width) clamped to 16–48 px.
     * @param canvas - canvas whose client width drives the cell size
     * @returns cell size in px
     */
    /**
     * @param {HTMLCanvasElement} canvas
     * @returns {number}
     */
    _cellSize(canvas: HTMLCanvasElement,): number {
      const grid = component.gameState?.state.grid;
      if (!grid || grid.width <= 0) { return MIN_CELL; }
      return Math.min(Math.max(Math.floor(canvas.clientWidth / grid.width,), MIN_CELL,), MAX_CELL,);
    },

    /**
     * Locate the canvas element (raw closure scope has no Alpine $refs proxy).
     * @returns the game canvas element, or null when absent
     */
    /**
     * @returns {HTMLCanvasElement | null}
     */
    _canvas(): HTMLCanvasElement | null {
      return document.querySelector<HTMLCanvasElement>("canvas[data-testid='game-canvas-grid']",);
    },

    /**
     * @returns {void}
     */
    _draw(): void {
      const canvas = component._canvas();
      if (!canvas) { return; }
      const ctx = canvas.getContext("2d",);
      if (!ctx) { return; }
      const payload = component.gameState;
      if (!payload) {
        // Empty/absent state: placeholder text, no grid draw.
        drawPlaceholder(canvas, ctx,);
        return;
      }
      const cols = Math.min(payload.state.grid.width, MAX_RENDER_CELLS,);
      const rows = Math.min(payload.state.grid.height, MAX_RENDER_CELLS,);
      drawScene(ctx, payload.state, cols, rows, component._cellSize(canvas,), component.selected?.id ?? null,);
    },
  };

  return component;
};
