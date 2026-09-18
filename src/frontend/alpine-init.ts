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

// ── 7. Alpine stores ────────────────────────────────────────────
import { initAlpineStores, } from "./stores";

// ── 8. Alpine components (x-data functions on globalThis) ───────
// Each import registers a globalThis.* function that Alpine picks up as x-data.
import "./alpine/index";

// ── 9. UI utilities (sidebar, toast, modal) ─────────────────────
import "./ui";

// ── 10. Asset preview global (openAssetPreview for embedded gallery grids) ──
import "./asset-preview";
import { toDate, } from "../utils/date";

// ── 2. Expose on globalThis ─────────────────────────────────────
const g = globalThis as Record<string, unknown>;
g.htmx = htmx;
g.Alpine = Alpine;

// ── 3. Alpine plugins ───────────────────────────────────────────
Alpine.plugin(morph,);

// ── 4. htmx config ──────────────────────────────────────────────
const cspNonce = (g.__cspNonce as string) || "";
if (cspNonce) {
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

// ── 5b. Client-side dates (<time data-client-date>) ───────────────
// Server emits machine-readable ISO in <time datetime>; the browser renders
// the viewer's own locale/zone. Runs on load + after every htmx swap.
function hydrateClientDates(root: ParentNode = document,): void {
  const els: Element[] = [];
  if (root instanceof Element && root.matches("time[data-client-date]",)) { els.push(root,); }
  for (const el of root.querySelectorAll("time[data-client-date]",)) { els.push(el,); }
  for (const el of els) {
    const iso = el.getAttribute("datetime",);
    if (!iso) { continue; }
    const d = toDate(iso,);
    if (Number.isNaN(d.getTime(),)) { continue; }
    el.textContent = el.getAttribute("data-client-date",) === "datetime"
      ? d.toLocaleString()
      : d.toLocaleDateString();
  }
}

g.hydrateClientDates = hydrateClientDates;
document.addEventListener("DOMContentLoaded", () => hydrateClientDates(),);
document.addEventListener("htmx:afterSwap", (e: Event,) => {
  // htmx dispatches afterSwap on each settled element (bubbles to document);
  // detail.target is the swap target. Hydrate both subtrees — each call is
  // a scoped querySelectorAll, so over-coverage costs one extra scan.
  const detail = (e as CustomEvent<{ target?: Element }>).detail;
  if (e.target instanceof Element) { hydrateClientDates(e.target,); }
  if (detail?.target instanceof Element && detail.target !== e.target) {
    hydrateClientDates(detail.target,);
  }
},);

// ── 6. htmx extensions (CJS side-effects) ───────────────────────

require("htmx.org/dist/ext/alpine-morph.js",);

require("htmx-ext-sse/sse.js",);
initAlpineStores();

// ── 12. Start Alpine (after all registrations) ──────────────────
document.addEventListener("DOMContentLoaded", () => Alpine.start(),);
