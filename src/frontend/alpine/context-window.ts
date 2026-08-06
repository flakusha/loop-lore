/**
 * Context Window Monitor (FEAT-069)
 *
 * Alpine.js component for displaying real-time token usage
 * in the chat header with color-coded thresholds.
 */

interface ContextWindowState {
  currentTokens: number;
  maxTokens: number;
  percentage: number;
  status: "ok" | "warning" | "critical" | "danger";
  threshold: number;
  loading: boolean;
  chatId: string | null;
}

(globalThis as unknown as Record<string, unknown>).contextWindow = function() {
  return {
    currentTokens: 0,
    maxTokens: 32_000,
    percentage: 0,
    status: "ok" as ContextWindowState["status"],
    threshold: 0.85,
    loading: false,
    chatId: null as string | null,

    /** Status color class for the progress bar */
    get statusColor(): string {
      switch (this.status) {
        case "ok": {
          return "bg-green-500";
        }
        case "warning": {
          return "bg-yellow-500";
        }
        case "critical": {
          return "bg-red-500";
        }
        case "danger": {
          return "bg-red-700";
        }
        default: {
          return "bg-green-500";
        }
      }
    },

    /** Status text for tooltip */
    get statusText(): string {
      switch (this.status) {
        case "ok": {
          return "Plenty of room";
        }
        case "warning": {
          return "Approaching limit";
        }
        case "critical": {
          return "Near limit, compaction triggered";
        }
        case "danger": {
          return "Danger, consider pruning/summarizing";
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
          this.status = data.status;
          this.threshold = data.threshold;
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

    /** Trigger a warning toast if at 75% threshold */
    checkWarning(): void {
      if (!(this.percentage >= 75 && this.percentage < 85)) {
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
