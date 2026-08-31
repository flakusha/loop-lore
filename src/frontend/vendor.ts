// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Vendor bundle — htmx, Alpine.js, morph plugin, htmx extensions.
 * Bundled by bun build --target browser into dist/public/vendor.js.
 * Loaded before app.ts so Alpine stores and htmx event handlers are ready.
 */

// `require` is provided by bun at bundle time (declared as a global in eslint.config.mjs frontend scope).

import morph from "@alpinejs/morph";
import Alpine from "alpinejs";
import htmx from "htmx.org";

// Initialize Alpine stores from shared definition (single source of truth).
// Wrapped in try-catch internally — a store failure never blocks Alpine.start().
import { initAlpineStores, } from "./stores";

const g = globalThis as Record<string, unknown>;
g.htmx = htmx;
g.Alpine = Alpine;
Alpine.plugin(morph,);

// Configure htmx CSP nonce (passed from layout.html via globalThis.__cspNonce)
const cspNonce = (g.__cspNonce as string) || "";
if (cspNonce) {
  htmx.config.inlineScriptNonce = cspNonce;
}

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

require("htmx.org/dist/ext/alpine-morph.js",);

require("htmx-ext-sse/sse.js",);

// Auto-start after all deferred scripts have loaded.
// MUST be registered before initAlpineStores so a store error never blocks it.
document.addEventListener("DOMContentLoaded", () => Alpine.start(),);
initAlpineStores();
