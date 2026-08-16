/**
 * Chat Movement Events — loading + helpers for NPC movement indicators.
 */
import type { ChatState, } from "./types";

export type ChatMovement = Partial<ChatState> & ThisType<ChatState>;

export const chatMovement: ChatMovement = {
  async loadMovementEvents() {
    if (!this.activeChat) { return; }
    this.loadingMovementEvents = true;
    try {
      const res = await apiFetch(`/api/npc-movement/recent/${this.activeChat}?limit=20`,);
      if (res.ok) {
        this.movementEvents = await res.json();
      }
    } catch {
      // non-critical — movement indicators are optional
    } finally {
      this.loadingMovementEvents = false;
    }
  },

  getMovementIcon(pattern: string,) {
    const icons: Record<string, string> = {
      patrol: "🔄",
      wander: "🚶",
      follow: "👥",
      flee: "🏃",
      idle: "⏸",
      move: "➡️",
    };
    return icons[pattern] ?? "📍";
  },
};
