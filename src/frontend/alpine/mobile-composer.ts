// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mobile Sticky Bottom Composer
 *
 * Sticky bottom message bar for mobile viewports (<=768px).
 * Delegates to the parent chatState() sendMessage() so the same
 * encryption, optimistic update, and SSE pipeline is used.
 * Shares the desktop per-chat draft (chat-drafts.ts): restores on init,
 * saves debounced on input. The parent's sendMessage clears the draft on
 * send (chat-send.ts), so this side never clears it.
 * Addresses iOS Safari 100vh bug via env(safe-area-inset-*).
 */

import { chatDraftStoreFor, defaultDraftStore, DRAFT_DEBOUNCE_MS, } from "./chat-drafts";
import { isKeyboardNavEnabled, } from "./shortcuts";

/**
 * Alpine component for the mobile sticky composer.
 * Delegates send to the nearest parent chatState().
 * @returns {{ isMobile: boolean; init(): void; destroy(): void; checkMobile(): boolean; submitMobile(): Promise<void>; }}
 */
export function mobileComposer() {
  let unlisten: (() => void) | null = null;

  return {
    isMobile: false,
    _draftTimer: null as ReturnType<typeof setTimeout> | null,

    /** @returns The composer input, or null before mount. */
    inputEl(): HTMLInputElement | null {
      const input = (this as unknown as { $refs: { mobileInput?: HTMLInputElement } }).$refs.mobileInput;
      return input ?? null;
    },

    /**
     * Resolve the parent chatState's active chat the same way submitMobile
     * does; null when no parent scope or no active chat.
     * @returns The chat id, or null.
     */
    activeChatId(): string | null {
      const el = (this as unknown as { $el: Element }).$el;
      const parent = (globalThis as unknown as { Alpine?: { $data?: (el: Element,) => Record<string, unknown> } })
        .Alpine?.$data?.(el,);

      const chatId = parent?.activeChat;
      return typeof chatId === "string" ? chatId : null;
    },

    /**
     * @returns {void}
     */
    init() {
      this.isMobile = this.checkMobile();
      unlisten = globalThis.matchMedia("(max-width: 768px)",)
        .addEventListener("change", (e: MediaQueryListEvent,) => {
          this.isMobile = e.matches;
        },) as unknown as () => void;

      this.restoreMobileDraft();
    },

    /**
     * Restore the active chat's shared draft when the input is empty —
     * desktop parity for switching to mobile mid-composition.
     * @returns {void}
     */
    restoreMobileDraft() {
      const input = this.inputEl();
      const store = defaultDraftStore();
      const chatId = this.activeChatId();
      if (!input || !store || !chatId || input.value !== "") { return; }

      input.value = chatDraftStoreFor(store,).read(chatId,)?.text ?? "";
    },

    /**
     * Debounced keystroke save into the shared per-chat draft.
     * @returns {void}
     */
    saveMobileDraft() {
      if (this._draftTimer) {
        clearTimeout(this._draftTimer,);
        this._draftTimer = null;
      }

      const timer = setTimeout(() => {
        this._draftTimer = null;
        const input = this.inputEl();
        const store = defaultDraftStore();
        const chatId = this.activeChatId();
        if (!input || !store || !chatId) { return; }
        chatDraftStoreFor(store,).write(chatId, input.value,);
      }, DRAFT_DEBOUNCE_MS,);

      // Never hold a test runner open for a UI debounce.
      const unref = (timer as unknown as { unref?: () => void }).unref;
      if (typeof unref === "function") { unref.call(timer,); }
      this._draftTimer = timer;
    },

    /**
     * @returns {void}
     */
    destroy() {
      if (this._draftTimer) {
        clearTimeout(this._draftTimer,);
        this._draftTimer = null;
      }

      unlisten?.();
    },

    /**
     * @returns {boolean}
     */
    checkMobile(): boolean {
      return globalThis.matchMedia("(max-width: 768px)",).matches;
    },

    /**
     * Forward submit to the parent chatState() sendMessage().
     * Reads the input value, delegates to parent, clears input.
     */
    async submitMobile() {
      if (!isKeyboardNavEnabled()) { return; }
      const input = this.inputEl();
      if (!input) { return; }
      const text = input.value.trim();
      if (!text) { return; }

      // Cancel any pending debounced save so it cannot resurrect the draft
      // after the parent's sendMessage clears it (chat-send.ts).
      if (this._draftTimer) {
        clearTimeout(this._draftTimer,);
        this._draftTimer = null;
      }

      // Delegate to parent chatState() sendMessage — uses the same
      // encryption, optimistic update, and SSE pipeline as input-area.
      const el = (this as unknown as { $el: Element }).$el;
      const parent = (globalThis as unknown as { Alpine?: { $data?: (el: Element,) => Record<string, unknown> } })
        .Alpine?.$data?.(el,);

      if (parent && typeof parent.sendMessage === "function") {
        // Forward the text into the parent's messageInput ref
        const parentInput = (parent as Record<string, unknown>).$refs as Record<string, unknown> | undefined;
        if (parentInput?.messageInput) {
          (parentInput.messageInput as HTMLInputElement).value = text;
        }

        await (parent.sendMessage as () => Promise<void>).call(parent,);
      }

      input.value = "";
    },
  };
}
