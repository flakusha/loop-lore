import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import type { ChatState, PromptTemplateInfo, } from "./types";

/**
 * Prompt template preview + per-chat override. Composed into the chat store.
 *
 * The GET /prompt-template endpoint returns the resolved system prompt (purpose
 * + source) plus the chat's current `override`. The override is editable
 * per-chat in the settings modal: setting it makes prompt assembly use it
 * instead of the character/world-setup/registry default; clearing restores the
 * default resolution (PUT with `promptOverride: null`).
 */
export const chatPromptTemplate: Partial<ChatState> & ThisType<ChatState> = {
  _promptTemplate: null as PromptTemplateInfo | null,
  _promptLoading: false,
  _promptExpanded: false,
  _promptOverrideDraft: "",
  _promptOverrideSaving: false,

  async loadPromptTemplate() {
    if (!this.activeChat) { return; }
    this._promptLoading = true;
    this._promptTemplate = null;
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/prompt-template`,);
      if (res.ok) {
        const info = (await res.json()) as PromptTemplateInfo;
        this._promptTemplate = info;
        this._promptOverrideDraft = info.override ?? "";
      }
    } catch {
      /* non-critical */
    } finally {
      this._promptLoading = false;
    }
  },

  async savePromptOverride() {
    if (!this.activeChat || this._promptOverrideSaving) { return; }
    const next = this._promptOverrideDraft.trim();
    this._promptOverrideSaving = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ promptOverride: next || null, },),
      },);
      if (res.ok) {
        await this.loadPromptTemplate();
        this.$dispatch?.("show-toast", {
          type: "success",
          message: next ? "Prompt override saved" : "Prompt override cleared",
        },);
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: "Failed to save prompt override", },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Failed to save prompt override", },);
    } finally {
      this._promptOverrideSaving = false;
    }
  },
};
