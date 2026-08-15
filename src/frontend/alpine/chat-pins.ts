// ── Chat pins (pin / unpin / list) — panel ─
import { apiFetch, } from "./htmx";
import { log as rootLog, } from "./logger";
import type { ChatPinRow, ChatState, } from "./types";

const log = rootLog.child({ module: "chat-pins", },);

export const chatPins: Partial<ChatState> & ThisType<ChatState> = {
  _pins: [] as ChatPinRow[],
  _pinsLoading: false,
  _pinsOpen: false,

  togglePinsPanel() {
    this._pinsOpen = !this._pinsOpen;
    if (this._pinsOpen && this.activeChat) {
      this.loadPins();
    }
  },

  async loadPins() {
    if (!this.activeChat) { return; }
    this._pinsLoading = true;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/pins`,);
      if (res.ok) {
        const body = await res.json();
        this._pins = (body.data as ChatPinRow[]) ?? [];
      }
    } catch (error) {
      log.warn("loadPins failed", { error: String(error,), },);
    }
    this._pinsLoading = false;
  },

  async pinMessage(messageId: string,) {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/pins`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ messageId, },),
      },);
      if (res.ok) { await this.loadPins(); }
    } catch (error) {
      log.warn("pinMessage failed", { error: String(error,), },);
    }
  },

  async unpinMessage(pinId: string,) {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/pins/${pinId}`, {
        method: "DELETE",
      },);
      if (res.ok) { await this.loadPins(); }
    } catch (error) {
      log.warn("unpinMessage failed", { error: String(error,), },);
    }
  },

  scrollToPinnedMessage(messageId: string,) {
    const el = document.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId,)}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center", },);
  },
};
