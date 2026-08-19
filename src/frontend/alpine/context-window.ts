// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Context Window Monitor (FEAT-069)
 *
 * Alpine.js component for displaying real-time token usage
 * in the chat header with color-coded thresholds.
 */
import { apiFetch, } from "./htmx";

interface ContextWindowState {
  currentTokens: number;
  maxTokens: number;
  percentage: number;
  status: "healthy" | "warning" | "critical" | "imminent";
  threshold: string;
  loading: boolean;
  chatId: string | null;
}

(globalThis as unknown as Record<string, unknown>).contextWindow = function() {
  return {
    currentTokens: 0,
    maxTokens: 32_000,
    available: 0,
    percentage: 0,
    status: "healthy" as ContextWindowState["status"],
    threshold: "healthy",
    loading: false,
    chatId: null as string | null,
    sections: [] as { name: string; tokens: number; pct: number }[],
    suggestions: [] as { section: string; tokens: number; message: string }[],
    suggestionsOpen: false,
    _refreshHandler: null as ((evt: Event,) => void) | null,

    /** Status color class for the progress bar */
    get statusColor(): string {
      switch (this.status) {
        case "healthy": {
          return "bg-green-500";
        }
        case "warning": {
          return "bg-yellow-500";
        }
        case "critical": {
          return "bg-orange-500";
        }
        case "imminent": {
          return "bg-red-600";
        }
        default: {
          return "bg-green-500";
        }
      }
    },

    /** Color class for a section segment in the stacked budget bar. */
    sectionColor(name: string,): string {
      switch (name) {
        case "system": {
          return "ctx-seg-system";
        }
        case "lore": {
          return "ctx-seg-lore";
        }
        case "memories": {
          return "ctx-seg-memories";
        }
        default: {
          return "ctx-seg-history";
        }
      }
    },

    /** CSS flex-grow weight for a section segment (its budget share in pct). */
    sectionGrow(name: string,): number {
      const seg = this.sections.find((s,) => s.name === name);
      return Math.max(seg?.pct ?? 0, 0.5,);
    },

    /** Status text for tooltip */
    get statusText(): string {
      switch (this.status) {
        case "healthy": {
          return "Plenty of room";
        }
        case "warning": {
          return "Approaching limit";
        }
        case "critical": {
          return "Near limit — pruning may trigger";
        }
        case "imminent": {
          return "At capacity — pruning active";
        }
        default: {
          return "";
        }
      }
    },

    /** Formatted token count for display */
    get formattedTokens(): string {
      return `${this.currentTokens.toLocaleString()} / ${this.maxTokens.toLocaleString()}`;
    },

    /** Formatted remaining budget for display */
    get formattedAvailable(): string {
      return `${this.available.toLocaleString()} free`;
    },

    /** True when a per-section breakdown is available (vs the fallback estimate). */
    get hasSections(): boolean {
      return this.sections.length > 0;
    },

    /** Load context window state from the API */
    async load(chatId: string,): Promise<void> {
      if (!chatId) { return; }
      this.chatId = chatId;
      this.loading = true;
      try {
        const res = await apiFetch(`/api/chats/${chatId}/context`, {
          headers: { Accept: "application/json", },
        },);
        if (res.ok) {
          const data = await res.json();
          this.currentTokens = data.currentTokens ?? this.currentTokens;
          this.maxTokens = data.maxTokens ?? this.maxTokens;
          this.available = data.available ?? Math.max(0, this.maxTokens - this.currentTokens,);
          this.percentage = data.percentage ?? this.percentage;
          this.status = data.status ?? data.threshold ?? "healthy";
          this.threshold = data.threshold ?? data.status ?? "healthy";
          this.sections = Array.isArray(data.sections,) ? data.sections : [];
          this.suggestions = Array.isArray(data.suggestions,) ? data.suggestions : [];
        }
      } catch {
        /* ignore — keep last known state */
      } finally {
        this.loading = false;
      }
    },

    /** Refresh context window state */
    async refresh(): Promise<void> {
      if (this.chatId) {
        await this.load(this.chatId,);
      }
    },

    /** Subscribe to the chat-loaded event so the meter updates per chat. */
    init(): void {
      this._refreshHandler = (evt: Event,) => {
        const chatId = (evt as CustomEvent<{ chatId?: string }>).detail?.chatId;
        if (chatId) { this.chatId = chatId; }
        void this.refresh();
      };
      document.addEventListener("chat-context-refresh", this._refreshHandler,);
      // Cold restore: on a full page load the header may mount after
      // loadMessages() already dispatched, so pick up the open chat here
      // from the chatState Alpine scope (same selector chat-side-channels uses).
      const chatRoot = document.querySelector<HTMLElement>("[x-data='chatState()']",);
      if (chatRoot && typeof Alpine !== "undefined") {
        const data = Alpine.$data(chatRoot,);
        const activeChat = data.activeChat as string | null | undefined;
        if (activeChat) {
          void this.load(activeChat,);
        }
      }
    },

    /** Remove the refresh listener (attached on unmount, belt-and-suspenders). */
    destroy(): void {
      if (this._refreshHandler) {
        document.removeEventListener("chat-context-refresh", this._refreshHandler,);
      }
    },

    /** Trigger a warning toast if at warning threshold */
    checkWarning(): void {
      if (this.status !== "warning") {
        return;
      }

      const event = new CustomEvent("show-toast", {
        detail: {
          type: "warning",
          message: `Context window at ${this.percentage}% — consider pruning or summarizing.`,
        },
      },);
      document.dispatchEvent(event,);
    },
  };
};
