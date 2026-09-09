// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mobile Sticky Bottom Composer
 *
 * Sticky bottom message bar for mobile viewports (<=768px).
 * Delegates to the parent chatState() sendMessage() so the same
 * encryption, optimistic update, and SSE pipeline is used.
 * Addresses iOS Safari 100vh bug via env(safe-area-inset-*).
 */

import { isKeyboardNavEnabled, } from "./shortcuts";

/**
 * Alpine component for the mobile sticky composer.
 * Delegates send to the nearest parent chatState().
 */
export function mobileComposer() {
  let unlisten: (() => void) | null = null;

  return {
    isMobile: false,

    init() {
      this.isMobile = this.checkMobile();
      unlisten = globalThis.matchMedia("(max-width: 768px)",)
        .addEventListener("change", (e: MediaQueryListEvent,) => {
          this.isMobile = e.matches;
        },) as unknown as () => void;
    },

    destroy() {
      unlisten?.();
    },

    checkMobile(): boolean {
      return globalThis.matchMedia("(max-width: 768px)",).matches;
    },

    /**
     * Forward submit to the parent chatState() sendMessage().
     * Reads the input value, delegates to parent, clears input.
     */
    async submitMobile() {
      if (!isKeyboardNavEnabled()) { return; }
      const input = (this as unknown as { $refs: { mobileInput?: HTMLInputElement } }).$refs.mobileInput ?? null;
      if (!input) { return; }
      const text = input.value.trim();
      if (!text) { return; }

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
