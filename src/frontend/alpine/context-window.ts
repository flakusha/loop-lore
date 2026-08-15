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
    percentage: 0,
    status: "healthy" as ContextWindowState["status"],
    threshold: "healthy",
    loading: false,
    chatId: null as string | null,

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
          this.currentTokens = data.currentTokens;
          this.maxTokens = data.maxTokens;
          this.percentage = data.percentage;
          this.status = data.status ?? data.threshold ?? "healthy";
          this.threshold = data.threshold ?? data.status ?? "healthy";
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
