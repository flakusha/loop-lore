// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-chat classifier tag subset picker — chat settings modal section.
 *
 * Loads the curated vocabulary plus this chat's active subset from
 * `GET /api/v1/chats/:id/classifier-tags` and persists the selection with
 * `PUT /api/v1/chats/:id/classifier-tags` (server-side enforces vocabulary
 * membership). Follows the quick-replies dirty-flag save pattern.
 */
import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import type { ChatState, } from "../types";

export const classifierTagsActions: Partial<ChatState> & ThisType<ChatState> = {
  /** Curated vocabulary entries available for this chat. */
  _classifierVocabulary: [] as string[],
  /** This chat's active subset (selection in the modal). */
  _classifierActive: [] as string[],
  /** True when the selection differs from the persisted subset. */
  _classifierDirty: false,

  /** Fetch vocabulary + active subset for the active chat. */
  async loadClassifierTags() {
    this._classifierVocabulary = [];
    this._classifierActive = [];
    this._classifierDirty = false;
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/classifier-tags`,);
      if (res.ok) {
        const data = await res.json() as { vocabulary?: string[]; active?: string[] };
        this._classifierVocabulary = data.vocabulary ?? [];
        this._classifierActive = data.active ?? [];
      }
    } catch {
      /* card stays empty */
    }
  },

  /**
   * Toggle a vocabulary tag in the selection.
   * @param tag - vocabulary tag the checkbox toggles
   */
  toggleClassifierTag(tag: string,) {
    const idx = this._classifierActive.indexOf(tag,);
    if (idx >= 0) {
      this._classifierActive.splice(idx, 1,);
    } else {
      this._classifierActive.push(tag,);
    }

    this._classifierDirty = true;
  },

  /** Persist the active subset for the active chat. */
  async saveClassifierTags() {
    if (!this.activeChat || !this._classifierDirty) { return; }
    try {
      // apiFetch/feFetch throws on non-2xx — the catch is the failure path.
      await apiFetch(`/api/v1/chats/${this.activeChat}/classifier-tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ tags: this._classifierActive, },),
      },);

      this._classifierDirty = false;
      this.$dispatch?.("show-toast", {
        type: "success",
        message: t("toasts.classifierTagsSaved",),
      },);
    } catch {
      // Rejected (e.g. a tag left the vocabulary mid-session): reload the
      // ground truth so the checkboxes reflect the persisted subset.
      this._classifierActive = [];
      await this.loadClassifierTags();
      this._classifierDirty = false;
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.classifierTagsSaveFailed",), },);
    }
  },
};
