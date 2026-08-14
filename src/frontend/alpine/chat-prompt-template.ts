import { apiFetch, } from "./htmx";
import type { ChatState, PromptTemplateInfo, } from "./types";

/** Prompt template preview state + fetch. Composed into the chat store. */
export const chatPromptTemplate: Partial<ChatState> & ThisType<ChatState> = {
  _promptTemplate: null as PromptTemplateInfo | null,
  _promptLoading: false,
  _promptExpanded: false,

  async loadPromptTemplate() {
    if (!this.activeChat) { return; }
    this._promptLoading = true;
    this._promptTemplate = null;
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/prompt-template`,);
      if (res.ok) {
        this._promptTemplate = await res.json();
      }
    } catch {
      /* non-critical */
    } finally {
      this._promptLoading = false;
    }
  },
};
