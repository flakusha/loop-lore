// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat prompt-improvement actions — composer "improve my prompt" integration.
 *
 * Methods merged into the chatActions surface (see chat-actions/index.ts) so
 * `this` resolves to the full ChatState. Calls POST /api/generation/prompt
 * (the unified prompt-improvement service) and swaps the composer draft.
 */
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { LocalInferenceUnavailable, runLocalPromptImprove, shouldOffloadTask, } from "../local-inference";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "chat", },);

export const promptImproveActions: Partial<ChatState> & ThisType<ChatState> = {
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
      // draft never reaches the server. Unavailable → fall through to server.
      if (shouldOffloadTask("prompt-improve",)) {
        try {
          const local = runLocalPromptImprove({ text, level: requestedLevel, },);
          this._promptImproveBackup = text;
          input.value = local.content;
          this.autoResize(input,);
          log.debug("Prompt improved locally, server bypassed", { engine: local.engine, },);
          this.$dispatch?.("show-toast", { type: "success", message: t("toasts.promptImproved",), },);
          return;
        } catch (error) {
          if (!(error instanceof LocalInferenceUnavailable)) { throw error; }
        }
      }
      const res = await apiFetch(
        "/api/generation/prompt",
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

  /**
   * Analyze the current draft (intent/clarity profile) and surface it as a toast.
   */
  async analyzePrompt() {
    const input = this.$refs.messageInput as HTMLTextAreaElement | undefined;
    const text = input?.value.trim() ?? "";
    if (!input || !text || this._improving) { return; }
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noActiveChat",), },);
      return;
    }
    this._improving = true;
    try {
      const res = await apiFetch(
        "/api/generation/prompt",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ mode: "analyze", text, chatId: this.activeChat, },),
        } as Parameters<typeof apiFetch>[1],
      );
      if (!res.ok) {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.promptImproveFailed",), },);
        return;
      }
      const data = await res.json();
      const analysis = data?.data?.analysis;
      if (analysis) {
        const issues: string[] = analysis.issues ?? [];
        const joined = issues.join("; ",);
        const summary = joined.length > 0
          ? `${analysis.intent} · ${joined}`
          : `${analysis.intent}`;
        this.$dispatch?.("show-toast", { type: "success", message: `${t("toasts.promptAnalyzed",)}: ${summary}`, },);
      }
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
