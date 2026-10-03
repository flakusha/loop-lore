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
import { getLocalEngine, } from "../local-engine";
import { LocalInferenceUnavailable, runLocalPromptImprove, shouldOffloadTask, } from "../local-inference";
import type { LocalInferenceResult, } from "../local-inference";
import { runLocalModelImprove, } from "../local-model-improve";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";
import { promptContent, requestPrompt, } from "./prompt-request";

const log = rootLog.child({ module: "chat", },);

/** Undo depth for the composer improve stack — 5 levels back is plenty. */
const MAX_IMPROVE_HISTORY = 5;

/**
 * Opt-in browser inference: deterministic cleanup first, then the downloaded
 * browser model when one is flagged ready. Anything unavailable returns null
 * and the caller falls back to the server — local inference never blocks.
 * @param text - Draft to improve.
 * @param level - Gradation level.
 * @returns Local result, or null when the server should handle it.
 */
async function tryLocalImprove(text: string, level: string,): Promise<LocalInferenceResult | null> {
  if (!shouldOffloadTask("prompt-improve",)) { return null; }
  try {
    return runLocalPromptImprove({ text, level, },);
  } catch (error) {
    if (!(error instanceof LocalInferenceUnavailable)) { throw error; }
  }

  try {
    return await runLocalModelImprove(getLocalEngine(), { text, level, },);
  } catch (error) {
    if (!(error instanceof LocalInferenceUnavailable)) { throw error; }
    return null;
  }
}

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
      // Opt-in browser inference first: eligible levels run locally so the
      // draft never reaches the server. Null → fall through to server.
      const local = await tryLocalImprove(text, requestedLevel,);
      if (local) {
        this.pushPromptImproveHistory(text,);
        input.value = local.content;
        this.autoResize(input,);
        log.debug("Prompt improved locally, server bypassed", { engine: local.engine, },);
        this.$dispatch?.("show-toast", { type: "success", message: t("toasts.promptImproved",), },);
        return;
      }
      const result = await requestPrompt({
        mode: "improve",
        level: requestedLevel,
        text,
        chatId: this.activeChat,
      },);
      if (!result.ok) {
        const message = result.injectionBlocked
          ? t("toasts.promptInjectionBlocked",)
          : result.message ?? t("toasts.promptImproveFailed",);
        this.$dispatch?.("show-toast", { type: "error", message, },);
        return;
      }
      const improved = promptContent(result.data,);
      if (!improved) {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.promptImproveFailed",), },);
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
