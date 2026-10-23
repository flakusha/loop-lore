// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-message translate control (FEAT-language-selection-three-level,
 * level 3). Alpine component mounted on the message list; drives the
 * on-demand POST /api/messages/:id/translations route and caches the
 * returned variant for inline display. Failures degrade to the original
 * message — never blocks rendering.
 */
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";

interface TranslationView {
  locale: string;
  content: string;
}

(globalThis as unknown as Record<string, unknown>).messageTranslate = function() {
  return {
    /** Message id currently being translated (spinner/disable state). */
    _mtBusy: "",
    /** message id → rendered translation variant. */
    _mtText: {} as Record<string, TranslationView>,

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
     * @returns {TranslationView | null}
     */
    translationFor(messageId: string,): TranslationView | null {
      return this._mtText[messageId] ?? null;
    },
  };
};
