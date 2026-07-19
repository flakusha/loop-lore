/**
 * HTMX Encrypt Extension
 *
 * Auto-decrypts response content after HTMX swaps.
 * Encryption is handled by Alpine at the message send layer.
 *
 * Usage:
 *   <div hx-ext="encrypt">
 *     <span data-encrypt="true">encrypted-payload-here</span>
 *   </div>
 *
 * Requires window.__chatKey (CryptoKey) set by Alpine init.
 */

import { browserDecryptThenDecompress } from "./browser";

const EXTENSION_NAME = "encrypt";
const DECRYPT_ATTR = "data-encrypt";

function getChatKey(): CryptoKey | null {
  return (globalThis as Record<string, unknown>).__chatKey as CryptoKey | null;
}

async function decryptElements(root: HTMLElement): Promise<void> {
  const key = getChatKey();
  if (!key) return;
  const targets = root.querySelectorAll<HTMLElement>(`[${CSS.escape(DECRYPT_ATTR)}]`);
  for (const el of targets) {
    const text = el.textContent;
    if (!text) continue;
    const plain = await browserDecryptThenDecompress(text, key);
    el.textContent = plain;
  }
}

if (typeof htmx !== "undefined") {
  htmx.defineExtension(EXTENSION_NAME, {
    onEvent: function(_name: string, evt: CustomEvent) {
      if (evt.type !== "htmx:afterSwap") {
        return;
      }

      const target = evt.detail.target as HTMLElement | undefined;
      if (target) void decryptElements(target);
    },
  });
}
