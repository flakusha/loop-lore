// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Command Buttons (Epic 42, D3 remainder)
 *
 * Alpine.js component for command button toolbar.
 * Provides quick access to assistant commands via button clicks
 * instead of typing slash commands.
 *
 * Buttons are filtered by user role — GM-only buttons (guide, scene, narrate,
 * create, review, quest) vs. general-use buttons (all others).
 */

interface CommandButton {
  name: string;
  label: string;
  icon: string;
  description: string;
  /** Role category: "gm" for GM-only, "all" for everyone. */
  role: "gm" | "all";
}

const COMMAND_BUTTONS: CommandButton[] = [
  // ── Media generation (all) ──
  { name: "image", label: "Image", icon: "🎨", description: "Generate image", role: "all", },
  { name: "video", label: "Video", icon: "🎬", description: "Generate video", role: "all", },
  { name: "sfx", label: "SFX", icon: "🔊", description: "Generate sound effect", role: "all", },
  { name: "music", label: "Music", icon: "🎵", description: "Generate or link music", role: "all", },
  { name: "caption", label: "Caption", icon: "🏷️", description: "Caption image", role: "all", },

  // ── Text tools (all) ──
  { name: "improve", label: "Improve", icon: "✨", description: "Improve last message", role: "all", },
  { name: "rewrite", label: "Rewrite", icon: "🔄", description: "Rewrite last message", role: "all", },
  { name: "translate", label: "Translate", icon: "🌐", description: "Translate text", role: "all", },
  { name: "summarize", label: "Summarize", icon: "📝", description: "Summarize conversation", role: "all", },

  // ── Dice & tools (all) ──
  { name: "roll", label: "Roll", icon: "🎲", description: "Roll dice", role: "all", },
  { name: "detail", label: "Detail", icon: "🔍", description: "Set detail level", role: "all", },
  { name: "stats", label: "Stats", icon: "📊", description: "Show chat statistics", role: "all", },
  { name: "context", label: "Context", icon: "ℹ️", description: "Show conversation context", role: "all", },

  // ── GM tools (GM role only) ──
  { name: "guide", label: "Guide", icon: "🎭", description: "GM: Give narrative direction", role: "gm", },
  { name: "scene", label: "Scene", icon: "🎬", description: "GM: Set scene/location", role: "gm", },
  { name: "narrate", label: "Narrate", icon: "📖", description: "GM: Inject narration", role: "gm", },
  { name: "create", label: "Create", icon: "✨", description: "GM: Create entity", role: "gm", },
  { name: "review", label: "Review", icon: "🔎", description: "GM: Review entity", role: "gm", },
  { name: "quest", label: "Quest", icon: "📜", description: "GM: Manage quests", role: "gm", },
];

(globalThis as unknown as Record<string, unknown>).commandButtons = function() {
  return {
    buttons: COMMAND_BUTTONS,
    showLabels: localStorage.getItem("command-button-labels",) === "1",

    /** Filtered buttons based on user role from $store.ui.userRole. */
    get filteredButtons(): CommandButton[] {
      try {
        const alpine = (globalThis as { Alpine?: { store: (n: string,) => Record<string, unknown> } }).Alpine;
        const role = alpine?.store("ui",)?.userRole as string | undefined;
        if (role === "owner") { return this.buttons; }
      } catch { /* fall through */ }
      const visible: CommandButton[] = [];
      for (const b of this.buttons) {
        if (b.role !== "gm") { visible.push(b,); }
      }
      return visible;
    },

    /**
     * Run a command by inserting it into the message input
     * @param cmd
     */
    runCommand(cmd: string,): void {
      // GM guidance commands open the GM Guidance panel instead of typing a
      // slash command — the panel captures narrative direction, scene, and
      // constraints far better than free text.
      if (cmd === "guide" || cmd === "scene") {
        const store = (globalThis as { Alpine?: { store: (name: string,) => Record<string, unknown> } }).Alpine;
        const ui = store?.store("ui",) as Record<string, unknown> | undefined;
        if (ui) {
          ui.showGmGuidance = true;
          ui.showChatSettings = true;
        }
        return;
      }
      if (cmd === "impersonate" || cmd === "char") {
        const chat = (globalThis as { Alpine?: { store: (n: string,) => Record<string, unknown> } })
          .Alpine
          ?.store("chat",);
        const impersonate = chat && typeof chat.impersonate === "function"
          ? (chat.impersonate as (cmd: string,) => void)
          : null;
        if (impersonate) { impersonate(cmd,); }
        return;
      }
      const input = document.querySelector("#message-input",) as HTMLTextAreaElement | null;
      if (input) {
        input.value = `/${cmd} `;
        input.focus();
        input.dispatchEvent(new Event("input", { bubbles: true, },),);
      }
    },

    /** Toggle button labels visibility */
    toggleLabels(): void {
      this.showLabels = !this.showLabels;
      localStorage.setItem("command-button-labels", this.showLabels ? "1" : "0",);
    },
  };
};
