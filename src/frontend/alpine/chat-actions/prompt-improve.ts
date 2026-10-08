// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat prompt-improvement actions — composer "improve my prompt" integration.
 *
 * Methods merged into the chatActions surface (see chat-actions/index.ts) so
 * `this` resolves to the full ChatState. Calls POST /api/v1/generation/prompt
 * (the unified prompt-improvement service) and swaps the composer draft.
 */
import { requireActiveChat, } from "../chat-guards";
import { t, } from "../i18n";
import { log as rootLog, } from "../logger";
import { enhanceText, } from "../text-enhance";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "chat", },);

/** Undo depth for the composer improve stack — 5 levels back is plenty. */
const MAX_IMPROVE_HISTORY = 5;

export const promptImproveActions: Partial<ChatState> & ThisType<ChatState> = {
  // Reactive defaults — input-area.html binds `:disabled="!activeChat ||
  // _improving"`; without an initial value the binding throws
  // "_improving is not defined" as soon as a chat is selected (the
  // `!activeChat` short-circuit hides it while no chat is open).
  _improving: false,
  _promptImproveHistory: [] as string[],
  /**
   * Push the current draft onto the undo stack, dropping the oldest level
   * once the bounded depth is reached.
   * @param draft
   */
  pushPromptImproveHistory(draft: string,) {
    this._promptImproveHistory = [...this._promptImproveHistory, draft,].slice(-MAX_IMPROVE_HISTORY,);
  },

  /**
   * Improve the current draft through the shared prompt-improvement service.
   * Pushes the previous draft onto `_promptImproveHistory` for multi-level undo.
   * @param level - Gradation level; group chats default to `style-group`
   */
  async improvePrompt(level?: string,) {
    const input = this.$refs.messageInput as HTMLTextAreaElement | undefined;
    const text = input?.value.trim() ?? "";
    if (!input || !text) { return; }
    if (this._improving) { return; }
    if (!requireActiveChat(this,)) { return; }

    this._improving = true;
    try {
      // Group chats rewrite in the group's voice by default; direct chats in
      // the 1:1 chat voice. Explicit levels from the level menu win.
      const requestedLevel = level ??
        (this.isGroupChat ? "style-group" : "style-chat");

      // Text transformation is delegated to the standalone primitive; the
      // hooks keep the composer's toast/log behavior verbatim.
      let serverFailed = false;
      const improved = await enhanceText(
        { text, level: requestedLevel, chatId: this.activeChat, },
        {
          onLocal: (engine,) => {
            log.debug("Prompt improved locally, server bypassed", { engine, },);
          },
          onServerFailure: (failure,) => {
            serverFailed = true;
            const message = failure.injectionBlocked
              ? t("toasts.promptInjectionBlocked",)
              : failure.message ?? t("toasts.promptImproveFailed",);

            this.$dispatch?.("show-toast", { type: "error", message, },);
          },
        },
      );

      if (!improved) {
        // Empty envelope (200 without content) — the hook already toasted
        // real failures, so only this branch needs the generic copy.
        if (!serverFailed) {
          this.$dispatch?.("show-toast", { type: "error", message: t("toasts.promptImproveFailed",), },);
        }

        return;
      }

      this.pushPromptImproveHistory(text,);
      input.value = improved;
      this.autoResize(input,);
      this.$dispatch?.("show-toast", { type: "success", message: t("toasts.promptImproved",), },);
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.promptImproveFailed",), },);
    } finally {
      this._improving = false;
    }
  },

  /** Pop one level off the improve history and restore that draft. */
  restorePromptDraft() {
    const input = this.$refs.messageInput as HTMLTextAreaElement | undefined;
    const history = this._promptImproveHistory;
    if (!input || history.length === 0) { return; }
    const depth = history.length;
    this._promptImproveHistory = history.slice(0, -1,);
    input.value = history[depth - 1] ?? "";
    this.autoResize(input,);
    log.debug("Prompt draft restored after improve", { remaining: depth - 1, },);
    this.$dispatch?.("show-toast", { type: "success", message: t("toasts.promptRestored",), },);
  },
};
