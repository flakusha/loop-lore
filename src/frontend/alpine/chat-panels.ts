export const chatPanels = {
  _toggleChatListHandler: null as (() => void) | null,
  _toggleGalleryHandler: null as (() => void) | null,
  _toggleCharacterInfoHandler: null as (() => void) | null,
  _panelClickHandler: null as ((e: MouseEvent) => void) | null,
  _keydownHandler: null as ((e: KeyboardEvent) => void) | null,
  _observer: null as MutationObserver | null,

  registerPanelHandlers() {
    const s = this as any;
    s._toggleChatListHandler = () => {
      Alpine.store("ui").showChatList = !Alpine.store("ui").showChatList;
    };
    s._toggleGalleryHandler = () => {
      Alpine.store("ui").showGallery = !Alpine.store("ui").showGallery;
    };
    s._toggleCharacterInfoHandler = () => {
      Alpine.store("ui").showCharacterInfo = true;
    };
    document.addEventListener("toggle-chat-list", s._toggleChatListHandler);
    document.addEventListener("toggle-gallery", s._toggleGalleryHandler);
    document.addEventListener("toggle-character-info", s._toggleCharacterInfoHandler);

    s._panelClickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const ui = Alpine.store("ui");
      const closeBtn = target.closest(
        ".gallery-sidebar .btn-icon, .right-panel .btn-icon, .chat-list-panel .btn-icon",
      );
      if (closeBtn) {
        if (closeBtn.closest(".gallery-sidebar")) ui.showGallery = false;
        else if (closeBtn.closest(".right-panel")) ui.showCharacterInfo = false;
        else if (closeBtn.closest(".chat-list-panel")) ui.showChatList = false;
        return;
      }
      const backdrop = target.closest(".panel-backdrop");
      if (backdrop) {
        ui.showGallery = false;
        ui.showCharacterInfo = false;
        ui.showChatList = false;
      }
    };
    document.addEventListener("click", s._panelClickHandler, { capture: true });

    s._observer = new MutationObserver(() => {
      if (!document.contains(s.$el)) {
        s.destroy();
      }
    });
    s._observer.observe(document.body, { childList: true, subtree: true });

    s._keydownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (Alpine.store("ui").showChatList) Alpine.store("ui").showChatList = false;
        else if (Alpine.store("ui").showGallery) Alpine.store("ui").showGallery = false;
        else if (Alpine.store("ui").showCharacterInfo) Alpine.store("ui").showCharacterInfo = false;
      }
      if (e.ctrlKey && e.key === "j") {
        const focusedMsg = document.querySelector<HTMLElement>(".message.focused");
        if (focusedMsg) {
          const msgId = focusedMsg.dataset.messageId;
          if (msgId) (this as any).continueMessage(msgId);
        }
      }
    };
    document.addEventListener("keydown", s._keydownHandler);
  },

  unregisterPanelHandlers() {
    const s = this as any;
    if (s._toggleChatListHandler) document.removeEventListener("toggle-chat-list", s._toggleChatListHandler);
    if (s._toggleGalleryHandler) document.removeEventListener("toggle-gallery", s._toggleGalleryHandler);
    if (s._toggleCharacterInfoHandler)
      document.removeEventListener("toggle-character-info", s._toggleCharacterInfoHandler);
    if (s._panelClickHandler) document.removeEventListener("click", s._panelClickHandler, true);
    if (s._keydownHandler) document.removeEventListener("keydown", s._keydownHandler);
    if (s._observer) s._observer.disconnect();
  },
};
