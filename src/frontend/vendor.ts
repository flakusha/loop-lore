/**
 * Vendor bundle — htmx, Alpine.js, morph plugin, htmx extensions.
 * Bundled by bun build --target browser into dist/public/vendor.js.
 * Loaded before app.ts so Alpine stores and htmx event handlers are ready.
 */

// `require` is provided by bun at bundle time (declared as a global in eslint.config.mjs frontend scope).

import morph from "@alpinejs/morph";
import Alpine from "alpinejs";
import htmx from "htmx.org";

const g = globalThis as Record<string, unknown>;
g.htmx = htmx;
g.Alpine = Alpine;
Alpine.plugin(morph,);

// Register $t magic property for client-side i18n
Alpine.magic("t", (el: HTMLElement,) => {
  // Resolve translation key using the app's locale strings
  const resolve = (key: string,): string => {
    const appData = Alpine.$data(el,);
    if (appData?.localeStrings) {
      const keys = key.split(".",);
      let value: any = appData.localeStrings;
      for (const k of keys) {
        value = value?.[k];
      }
      if (typeof value === "string") { return value; }
    }
    // Fallback to global locale strings
    const globalStrings = (globalThis as any).__localeStrings;
    if (globalStrings) {
      const keys = key.split(".",);
      let value: any = globalStrings;
      for (const k of keys) {
        value = value?.[k];
      }
      if (typeof value === "string") { return value; }
    }
    return key; // Return key as fallback
  };
  return resolve;
},);

// htmx extensions reference `htmx` as a free variable.
// Bun's require() inlines them in the same module scope where `htmx` is defined.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS required for htmx extension side effects
require("htmx.org/dist/ext/alpine-morph.js",);
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("htmx-ext-sse/sse.js",);

// Initialize Alpine stores immediately (before Alpine starts auto-initialization)
Alpine.store("sidebar", { open: false, },);
Alpine.store("chat", { currentChat: null, },);
Alpine.store("ui", {
  showChatList: false,
  showGallery: false,
  showCharacterInfo: false,
  showMemoryPanel: false,
  showUploadModal: false,
  showImportForm: false,
  showCreateForm: false,
  showEditModal: false,
  showPreviewModal: false,
  showChatSettings: false,
  showRenameModal: false,
  hasActiveChat: false,
},);

// Auto-start after all deferred scripts have loaded
document.addEventListener("DOMContentLoaded", () => Alpine.start(),);
