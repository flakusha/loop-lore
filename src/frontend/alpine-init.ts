// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Alpine.js Single Entry Point — ALL init in one bundle.
 *
 * This file replaces vendor.ts + app.ts to avoid the multi-bundle Alpine
 * module-copy problem. Every Alpine store, component, plugin, and htmx
 * extension is registered here BEFORE Alpine.start().
 *
 * Other bundles (pages.js, chat-vendor.js) access state via globalThis only —
 * they never import Alpine directly.
 */

// ── 1. Framework imports ────────────────────────────────────────
import morph from "@alpinejs/morph";
import Alpine from "alpinejs";
import htmx from "htmx.org";

// ── 2. Expose on globalThis ─────────────────────────────────────
const g = globalThis as Record<string, unknown>;
g.htmx = htmx;
g.Alpine = Alpine;

// ── 3. Alpine plugins ───────────────────────────────────────────
Alpine.plugin(morph,);

// ── 4. htmx config ──────────────────────────────────────────────
const cspNonce = (g.__cspNonce as string) || "";
if (cspNonce) {
  htmx.config = htmx.config || {};
  htmx.config.inlineScriptNonce = cspNonce;
}

// ── 5. Alpine magic: $t (i18n) ──────────────────────────────────
Alpine.magic("t", (el: HTMLElement,) => {
  const resolve = (key: string,): string => {
    const appData = Alpine.$data(el,);
    if (appData?.localeStrings) {
      const keys = key.split(".",);
      let value: unknown = appData.localeStrings;
      for (const k of keys) { value = (value as Record<string, unknown>)?.[k]; }
      if (typeof value === "string") { return value; }
    }
    const globalStrings = g.__localeStrings as Record<string, unknown> | undefined;
    if (globalStrings) {
      const keys = key.split(".",);
      let value: unknown = globalStrings;
      for (const k of keys) { value = (value as Record<string, unknown>)?.[k]; }
      if (typeof value === "string") { return value; }
    }
    return key;
  };
  return resolve;
},);

// ── 6. htmx extensions (CJS side-effects) ───────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("htmx.org/dist/ext/alpine-morph.js",);
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("htmx-ext-sse/sse.js",);

// ── 7. Alpine stores ────────────────────────────────────────────
import { initAlpineStores, } from "./stores";
initAlpineStores();

// ── 8. Alpine components (x-data functions on globalThis) ───────
// Each import registers a globalThis.* function that Alpine picks up as x-data.
import "./alpine/index";

// ── 9. UI utilities (sidebar, toast, modal) ─────────────────────
import "./ui";

// ── 10. Gallery upload dropzone ─────────────────────────────────
import "./gallery-upload";

// ── 12. Start Alpine (after all registrations) ──────────────────
document.addEventListener("DOMContentLoaded", () => Alpine.start(),);
