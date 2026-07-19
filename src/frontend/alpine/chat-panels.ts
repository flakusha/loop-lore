import type { ChatState, } from "./types";

export const chatPanels: Partial<ChatState> & ThisType<ChatState> = {
  _toggleChatListHandler: null as (() => void) | null,
  _toggleGalleryHandler: null as (() => void) | null,
  _toggleCharacterInfoHandler: null as (() => void) | null,
  _toggleMemoryPanelHandler: null as (() => void) | null,
  _panelClickHandler: null as ((e: MouseEvent,) => void) | null,
  _keydownHandler: null as ((e: KeyboardEvent,) => void) | null,
  _observer: null as MutationObserver | null,

  registerPanelHandlers() {
    this._toggleChatListHandler = () => {
      Alpine.store("ui",).showChatList = !Alpine.store("ui",).showChatList;
    };
    this._toggleGalleryHandler = () => {
      Alpine.store("ui",).showGallery = !Alpine.store("ui",).showGallery;
    };
    this._toggleCharacterInfoHandler = () => {
      Alpine.store("ui",).showCharacterInfo = true;
    };
    this._toggleMemoryPanelHandler = () => {
      Alpine.store("ui",).showMemoryPanel = !Alpine.store("ui",).showMemoryPanel;
    };
    document.addEventListener("toggle-chat-list", this._toggleChatListHandler,);
    document.addEventListener("toggle-gallery", this._toggleGalleryHandler,);
    document.addEventListener("toggle-character-info", this._toggleCharacterInfoHandler,);
    document.addEventListener("toggle-memory-panel", this._toggleMemoryPanelHandler,);

    this._panelClickHandler = (e: MouseEvent,) => {
      const target = e.target as HTMLElement;
      const ui = Alpine.store("ui",);
      const closeBtn = target.closest(
        ".gallery-sidebar .btn-icon, .right-panel .btn-icon, .chat-list-panel .btn-icon",
      );
      if (closeBtn) {
        if (closeBtn.closest(".gallery-sidebar",)) { ui.showGallery = false; }
        else if (closeBtn.closest(".right-panel",)) { ui.showCharacterInfo = false; }
        else if (closeBtn.closest(".chat-list-panel",)) { ui.showChatList = false; }
        return;
      }
      const backdrop = target.closest(".panel-backdrop",);
      if (backdrop) {
        ui.showGallery = false;
        ui.showCharacterInfo = false;
        ui.showChatList = false;
        ui.showMemoryPanel = false;
      }
    };
    document.addEventListener("click", this._panelClickHandler, { capture: true, },);

    this._observer = new MutationObserver(() => {
      if (!document.contains(this.$el,)) {
        this.destroy();
      }
    },);
    this._observer.observe(document.body, { childList: true, subtree: true, },);

    this._keydownHandler = (e: KeyboardEvent,) => {
      if (e.key === "Escape") {
        if (Alpine.store("ui",).showChatList) { Alpine.store("ui",).showChatList = false; }
        else if (Alpine.store("ui",).showGallery) { Alpine.store("ui",).showGallery = false; }
        else if (Alpine.store("ui",).showCharacterInfo) { Alpine.store("ui",).showCharacterInfo = false; }
        else if (Alpine.store("ui",).showMemoryPanel) { Alpine.store("ui",).showMemoryPanel = false; }
      }
      if (e.ctrlKey && e.key === "j") {
        const focusedMsg = document.querySelector<HTMLElement>(".message.focused",);
        if (focusedMsg) {
          const msgId = focusedMsg.dataset.messageId;
          if (msgId) { this.continueMessage(msgId,); }
        }
      }
    };
    document.addEventListener("keydown", this._keydownHandler,);
  },

  unregisterPanelHandlers() {
    if (this._toggleChatListHandler) {
      document.removeEventListener("toggle-chat-list", this._toggleChatListHandler,);
    }
    if (this._toggleGalleryHandler) {
      document.removeEventListener("toggle-gallery", this._toggleGalleryHandler,);
    }
    if (this._toggleCharacterInfoHandler) {
      document.removeEventListener("toggle-character-info", this._toggleCharacterInfoHandler,);
    }
    if (this._toggleMemoryPanelHandler) {
      document.removeEventListener("toggle-memory-panel", this._toggleMemoryPanelHandler,);
    }
    if (this._panelClickHandler) { document.removeEventListener("click", this._panelClickHandler, true,); }
    if (this._keydownHandler) { document.removeEventListener("keydown", this._keydownHandler,); }
    if (this._observer) { this._observer.disconnect(); }
  },
};
