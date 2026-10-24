// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-message translate control (FEAT-language-selection-three-level,
 * level 3). Merged into the `chatState` scope: the message list renders
 * inside that scope, and a nested Alpine component on the list itself
 * would shadow the chatState `$refs.messageList` (breaking chat
 * auto-scroll and the browser e2e state reads). Drives the on-demand
 * POST /api/v1/messages/:id/translations route and caches the returned
 * variant for inline display. Failures degrade to the original message —
 * never blocks rendering.
 */
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import type { ChatState, } from "./types";

export const messageTranslate: Partial<ChatState> & ThisType<ChatState> = {
  /** Message id currently being translated (spinner/disable state). */
  _mtBusy: "",
  /** message id → rendered translation variant. */
  _mtText: {},

  /**
   * Resolve the display locale for the translate button: the UI-locale
   * cookie chain is the lowest preference rung of the server-side
   * precedence (message > chat > user > UI locale).
   * @returns {string}
   */
  mtLocale(): string {
    const match = /(?:^|;\s*)ll_locale=([^;]+)/.exec(document.cookie,);
    return match?.[1] ?? "en";
  },

  /**
   * Translate a message into the resolved display locale.
   * @param {string} messageId
   * @returns {Promise<void>}
   */
  async translateMessage(messageId: string,): Promise<void> {
    if (this._mtBusy) { return; }
    this._mtBusy = messageId;
    try {
      const res = await apiFetch(`/api/v1/messages/${encodeURIComponent(messageId,)}/translations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", },
        body: jsonBody({ locale: this.mtLocale(), },),
      },);

      if (!res.ok) {
        showToast("error", t("messages.translateFailed",),);
        return;
      }

      const data = await res.json() as { skipped?: boolean; reason?: string; locale?: string; content?: string };
      if (data.skipped) {
        showToast("info", t("messages.translateSkipped",),);
        return;
      }

      this._mtText[messageId] = { locale: data.locale ?? this.mtLocale(), content: data.content ?? "", };
    } catch {
      showToast("error", t("messages.translateFailed",),);
    } finally {
      this._mtBusy = "";
    }
  },

  /**
   * Cached translation for a message (null = none shown).
   * @param {string} messageId
   * @returns {ReturnType<ChatState["translationFor"]>}
   */
  translationFor(messageId: string,): ReturnType<ChatState["translationFor"]> {
    return this._mtText[messageId] ?? null;
  },
};
