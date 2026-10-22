// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { refreshHtmx, } from "../dom";
import { feFetch, getCsrfToken, } from "../fe-fetch";
import { normalizeHeaderSlot, } from "./htmx-header";
import { t, } from "./i18n";
import { jsonParseOr, } from "./json";
import { log, } from "./logger";

const apiLog = log.child({ module: "api", },);

// Global error capture for debugging page loader issues
addEventListener("error", (e: ErrorEvent,) => {
  apiLog.error(`Uncaught: ${e.message}`, undefined, {
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
  },);
},);

// `apiFetch` is the Alpine/chat-layer alias for the unified frontend request
// helper. It delegates to `feFetch` (../fe-fetch) for header + 401 handling and
// adds request/response logging. Vanilla pages call `feFetch` directly.
/**
 * @param url
 * @param options
 * @returns {Promise<Response>}
 */
export async function apiFetch(
  url: string,
  options?: RequestInit & { idempotencyKey?: string | true; stream?: boolean },
): Promise<Response> {
  const method = options?.method ?? "GET";
  const start = performance.now();
  apiLog.info(`${method} ${url}`, { direction: "request", },);
  const res = await feFetch(url, options,);
  const elapsed = Math.round(performance.now() - start,);
  apiLog.info(`${res.status} ${url}`, { direction: "response", elapsedMs: elapsed, },);
  return res;
}

globalThis.apiFetch = apiFetch;

// ── htmx event handlers ───────────────────────────────────

document.addEventListener("htmx:config:request", (e: Event,) => {
  const detail = (e as CustomEvent<{ ctx?: { request?: { headers: Record<string, string> } } }>)?.detail;
  const headers = detail?.ctx?.request?.headers;
  apiLog.debug("htmx:config:request", { path: (detail as any)?.path, },);
  // Browser auth rides the HttpOnly `ll_token` cookie (same-origin, automatic)
  // — no Bearer fallback: `localStorage.session_token` has no writer.
  // CSRF double-submit: echo the (non-HttpOnly) csrf_token cookie value in
  // the header. htmx sends same-origin cookies automatically, so the cookie
  // half is already present; without this header the both-halves gate
  // (src/middleware/csrf.ts) rejects every hx-post/hx-put partial with 403.
  const csrf = getCsrfToken();
  if (csrf && headers) { headers["X-CSRF-Token"] = csrf; }
},);

document.addEventListener("htmx:before:swap", () => {
  apiLog.debug("htmx:before:swap",);
},);

// Trigger page-specific loaders on htmx content swaps (for pages still using JS)
const PAGE_LOADERS = new Map<string, string>([["#create-chat-form", "loadNewChatPage",],],);

/** */
function triggerPageLoaders(): void {
  for (const [sel, fn,] of PAGE_LOADERS) {
    if (document.querySelector(sel,)) {
      (globalThis as any)[fn]?.();
    }
  }
}

document.addEventListener("htmx:after:init", (e: Event,) => {
  const elt = ((e as any).target || (e as any).elt || (e as any)?.detail?.elt) as Element;
  apiLog.debug("htmx:after:init", { tag: elt?.tagName, id: (elt as any)?.id, },);
  if (elt && (globalThis as any).htmx && globalThis.Alpine) {
    htmx.process(elt as HTMLElement,);
    try {
      Alpine.initTree(elt as HTMLElement,);
    } catch {
      /* Alpine may fail on partial swaps */
    }
  }

  triggerPageLoaders();
  normalizeHeaderSlot();
},);

// Update document title from header title after navigation
document.addEventListener("htmx:after:swap", () => {
  const header = document.querySelector<HTMLElement>("#header-slot .title",);
  if (header) {
    const title = header.textContent?.trim() || "";
    if (title) {
      document.title = `${title} — Loop Lore`;
    }
  }
},);

document.addEventListener("htmx:response:error", (e: Event,) => {
  const detail = (e as CustomEvent<any>)?.detail;
  const xhr = detail?.xhr;
  if (xhr) {
    let msg = `Error ${xhr.status}`;
    try {
      const body = jsonParseOr<Record<string, unknown>>(xhr.responseText, {},);
      if (body?.error) { msg = body.error as string; }
    } catch {
      apiLog.warn("htmx:response:error body not JSON",);
    }

    document.dispatchEvent(new CustomEvent("show-toast", { detail: { type: "error", message: msg, }, },),);
    return;
  }

  const res = detail?.ctx?.response;
  if (!res) { return; }
  res
    .clone()
    .text()
    .then((text: string,) => {
      let msg = `Error ${res.status}`;
      try {
        const body = jsonParseOr<Record<string, unknown>>(text, {},);
        if (body?.error) { msg = body.error as string; }
      } catch {
        apiLog.warn("htmx:response:error body not JSON",);
      }

      document.dispatchEvent(new CustomEvent("show-toast", { detail: { type: "error", message: msg, }, },),);
    },)
    .catch(() => {
      document.dispatchEvent(
        new CustomEvent("show-toast", { detail: { type: "error", message: `Error ${res.status}`, }, },),
      );
    },);
},);

// ── Alpine stores ────────────────────────────────────────
// Primary init is in vendor.ts via stores/index.ts (before Alpine.start()).
// No safety net needed — vendor.ts runs synchronously before app.js.

// Also trigger page loaders on initial page load (for direct navigation, not htmx)
document.addEventListener("DOMContentLoaded", triggerPageLoaders,);

// ── hx-on::after-request replacements (success events) ──────
document.addEventListener("htmx:after:request", (e: Event,) => {
  const detail = (e as CustomEvent<{ successful?: boolean; elt?: HTMLElement }>)?.detail;
  if (!detail?.successful) { return; }
  const successEvent = detail.elt?.dataset?.hxSuccessEvent;
  if (successEvent) {
    document.dispatchEvent(new CustomEvent(successEvent,),);
  }
},);

document.addEventListener("asset:uploaded", () => {
  document.querySelector("#upload-modal",)?.classList.remove("open",);
  showToast("success", t("toasts.assetUploaded",),);
  refreshHtmx("#asset-grid",);
},);

document.addEventListener(
  "asset:duplicate",
  ((e: CustomEvent,) => {
    document.querySelector("#upload-modal",)?.classList.remove("open",);
    const filename = e.detail?.filename ?? t("gallery.assetFallback",);
    showToast("warning", t("toasts.assetAlreadyExists", { filename, },),);
    const grid = document.querySelector("#asset-grid",);
    if (grid) { htmx.trigger(grid, "load",); }
  }) as EventListener,
);

document.addEventListener("character:created", () => {
  showToast("success", t("toasts.characterCreated",),);
  refreshHtmx("#character-grid",);
},);

document.addEventListener("character:imported", () => {
  document.querySelector("#import-modal",)?.classList.remove("open",);
  showToast("success", t("toasts.characterImported",),);
  refreshHtmx("#character-grid",);
},);

document.addEventListener("world:saved", () => {
  document.querySelector("#edit-world-modal",)?.classList.remove("open",);
  showToast("success", t("toasts.worldSaved",),);
  refreshHtmx("#world-detail",);
},);

// ── Global keyboard: Escape closes sidebar ──────────────────
document.addEventListener("keydown", (e: KeyboardEvent,) => {
  if (e.key !== "Escape") { return; }
  const sidebar = document.querySelector("#layout-sidebar",);
  if (sidebar?.classList.contains("open",)) {
    closeSidebar();
  }
},);
