// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat prompt-improvement actions — composer "improve my prompt" integration.
 *
 * Methods merged into the chatActions surface (see chat-actions/index.ts) so
 * `this` resolves to the full ChatState. Calls POST /api/v1/generation/prompt
 * (the unified prompt-improvement service) and swaps the composer draft.
 */
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { getLocalEngine, } from "../local-engine";
import { LocalInferenceUnavailable, runLocalPromptImprove, shouldOffloadTask, } from "../local-inference";
import type { LocalInferenceResult, } from "../local-inference";
import { runLocalModelImprove, } from "../local-model-improve";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "chat", },);

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
  _promptImproveBackup: undefined,

  /**
   * Improve the current draft through the shared prompt-improvement service.
   * Keeps the previous draft in `_promptImproveBackup` for one-click undo.
   * @param level - Gradation level; group chats default to `style-group`
   */
  async improvePrompt(level?: string,) {
    const input = this.$refs.messageInput as HTMLTextAreaElement | undefined;
    const text = input?.value.trim() ?? "";
    if (!input || !text) { return; }
    if (this._improving) { return; }
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noActiveChat",), },);
      return;
    }

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
        this._promptImproveBackup = text;
        input.value = local.content;
        this.autoResize(input,);
        log.debug("Prompt improved locally, server bypassed", { engine: local.engine, },);
        this.$dispatch?.("show-toast", { type: "success", message: t("toasts.promptImproved",), },);
        return;
      }
      const res = await apiFetch(
        "/api/v1/generation/prompt",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            mode: "improve",
            level: requestedLevel,
            text,
            chatId: this.activeChat,
          },),
        } as Parameters<typeof apiFetch>[1],
      );
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: undefined, }));
        const blocked = res.status === 403 && error?.error === "injection_detected";
        const message = blocked
          ? t("toasts.promptInjectionBlocked",)
          : error?.message ?? t("toasts.promptImproveFailed",);
        this.$dispatch?.("show-toast", { type: "error", message, },);
        return;
      }
      const data = await res.json();
      const improved = data?.data?.content;
      if (typeof improved !== "string" || improved.length === 0) {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.promptImproveFailed",), },);
        return;
      }
      this._promptImproveBackup = text;
      input.value = improved;
      this.autoResize(input,);
      this.$dispatch?.("show-toast", { type: "success", message: t("toasts.promptImproved",), },);
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.promptImproveFailed",), },);
    } finally {
      this._improving = false;
    }
  },

  /** Restore the draft saved by {@link improvePrompt}. */
  restorePromptDraft() {
    const input = this.$refs.messageInput as HTMLTextAreaElement | undefined;
    const backup = this._promptImproveBackup;
    if (!input || !backup) { return; }
    input.value = backup;
    this._promptImproveBackup = undefined;
    this.autoResize(input,);
    log.debug("Prompt draft restored after improve",);
    this.$dispatch?.("show-toast", { type: "success", message: t("toasts.promptRestored",), },);
  },
};
