// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat prompt-analysis actions — composer "analyze my prompt" integration.
 *
 * Methods merged into the chatActions surface (see chat-actions/index.ts) so
 * `this` resolves to the full ChatState. Calls POST /api/generation/prompt
 * with mode `analyze` (served by src/generation/prompt-route.ts — no route
 * registration needed) and renders the intent/clarity/suggestions profile
 * into display-only state. The composer draft is never modified.
 */
import type { ChatPromptAnalyzeState, PromptAnalysisProfile, } from "../chat-types/prompt-analyze-state";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { getLocalEngine, } from "../local-engine";
import { LocalInferenceUnavailable, shouldOffloadTask, } from "../local-inference";
import type { LocalInferenceResult, } from "../local-inference";
import { runLocalModelImprove, } from "../local-model-improve";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

export type { ChatPromptAnalyzeState, };

const log = rootLog.child({ module: "chat", },);

type AnalyzeCtx = ChatState & ChatPromptAnalyzeState;

/**
 * Opt-in browser inference for analysis: the downloaded browser model when
 * one is flagged ready. Unavailable returns null and the caller falls back
 * to the server — local inference never blocks. No dedicated local analyze
 * instruction exists yet, so this falls through until one is added.
 * @param text - Draft to analyze.
 * @returns Local result, or null when the server should handle it.
 */
async function tryLocalAnalyze(text: string,): Promise<LocalInferenceResult | null> {
  if (!shouldOffloadTask("prompt-analyze",)) { return null; }
  try {
    return await runLocalModelImprove(getLocalEngine(), { text, level: "analyze", },);
  } catch (error) {
    if (!(error instanceof LocalInferenceUnavailable)) { throw error; }
    return null;
  }
}

export const promptAnalyzeActions: Partial<AnalyzeCtx> & ThisType<AnalyzeCtx> = {
  /**
   * Analyze the current draft (intent/clarity profile) into display-only
   * state plus a summary toast. Never touches the composer draft.
   */
  async analyzePrompt() {
    const input = this.$refs.messageInput as HTMLTextAreaElement | undefined;
    const text = input?.value.trim() ?? "";
    if (!input || !text) { return; }
    if (this._analyzing) { return; }
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noActiveChat",), },);
      return;
    }

    this._analyzing = true;
    try {
      // Opt-in browser inference first. Null → fall through to server.
      const local = await tryLocalAnalyze(text,);
      if (local) {
        this._promptAnalysis = {
          intent: "statement",
          clarity: 0,
          issues: [],
          suggestions: [local.content,],
          confidence: 0,
        };
        log.debug("Prompt analyzed locally, server bypassed", { engine: local.engine, },);
        this.$dispatch?.("show-toast", { type: "success", message: `${t("analyze.ready",)}: ${local.content}`, },);
        return;
      }
      const res = await apiFetch(
        "/api/generation/prompt",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ mode: "analyze", text, chatId: this.activeChat, },),
        } as Parameters<typeof apiFetch>[1],
      );
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: undefined, }));
        const blocked = res.status === 403 && error?.error === "injection_detected";
        const message = blocked
          ? t("toasts.promptInjectionBlocked",)
          : res.status === 503
          ? t("analyze.unavailable",)
          : error?.message ?? t("analyze.failed",);
        this.$dispatch?.("show-toast", { type: "error", message, },);
        return;
      }
      const data = await res.json();
      const analysis: unknown = data?.data?.analysis;
      if (!isAnalysisProfile(analysis,)) {
        this.$dispatch?.("show-toast", { type: "error", message: t("analyze.failed",), },);
        return;
      }
      // Display-only: the draft stays untouched; the panel reads this state.
      this._promptAnalysis = analysis;
      const detail = analysis.suggestions[0] ?? analysis.issues[0] ?? "";
      const summary = `${analysis.intent} · ${Math.round(analysis.clarity * 100,)}%${detail ? ` · ${detail}` : ""}`;
      this.$dispatch?.("show-toast", { type: "success", message: `${t("analyze.ready",)}: ${summary}`, },);
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("analyze.failed",), },);
    } finally {
      this._analyzing = false;
    }
  },

  /** Clear the displayed analysis profile. */
  clearPromptAnalysis() {
    this._promptAnalysis = undefined;
    log.debug("Prompt analysis cleared",);
  },
};

/**
 * Guard the server analysis payload before rendering.
 * @param value - Decoded `data.analysis` payload.
 * @returns True when the payload renders as a profile.
 */
function isAnalysisProfile(value: unknown,): value is PromptAnalysisProfile {
  if (!value || typeof value !== "object") { return false; }
  const profile = value as Record<string, unknown>;
  return typeof profile.intent === "string" &&
    typeof profile.clarity === "number" &&
    Array.isArray(profile.issues,) &&
    Array.isArray(profile.suggestions,) &&
    typeof profile.confidence === "number";
}
