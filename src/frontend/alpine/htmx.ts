import { feFetch, } from "../fe-fetch";
import { normalizeHeaderSlot, } from "./htmx-header";
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
export async function apiFetch(url: string, options?: RequestInit,): Promise<Response> {
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

document.addEventListener("htmx:configRequest", (e: CustomEvent<{ headers: Record<string, string> }>,) => {
  apiLog.debug("htmx:configRequest", { path: (e as any)?.detail?.path, },);
  const token = localStorage.getItem("session_token",);
  if (token) {
    e.detail.headers.Authorization = `Bearer ${  token}`;
  }
},);

document.addEventListener("htmx:beforeSwap", () => {
  apiLog.debug("htmx:beforeSwap",);
},);

// Trigger page-specific loaders on htmx content swaps (for pages still using JS)
const PAGE_LOADERS = new Map<string, string>([["#create-chat-form", "loadNewChatPage",],],);

function triggerPageLoaders(): void {
  for (const [sel, fn,] of PAGE_LOADERS) {
    if (document.querySelector(sel,)) {
      (globalThis as any)[fn]?.();
    }
  }
}

document.addEventListener("htmx:load", (e: CustomEvent<{ elt: Element }>,) => {
  const elt = e.detail.elt;
  apiLog.debug("htmx:load", { tag: elt?.tagName, id: (elt as any)?.id, },);
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
document.addEventListener("htmx:afterSwap", (e: Event,) => {
  const target = (e as CustomEvent<{ target: Element }>)?.detail?.target;
  if (target) {
    const header = document.querySelector<HTMLElement>("#header-slot .title",);
    if (header) {
      const title = header.textContent?.trim() || "";
      if (title) {
        document.title = `${title} — Loop Lore`;
      }
    }
  }
},);

document.addEventListener("htmx:responseError", (e: CustomEvent<{ xhr?: XMLHttpRequest }>,) => {
  const xhr = e.detail.xhr;
  if (!xhr) { return; }
  try {
    const body = jsonParseOr<Record<string, unknown>>(xhr.responseText, {},);
    const msg = (body as any)?.error || `Error ${xhr.status}`;
    document.dispatchEvent(new CustomEvent("show-toast", { detail: { type: "error", message: msg, }, },),);
  } catch {
    document.dispatchEvent(
      new CustomEvent("show-toast", { detail: { type: "error", message: `Error ${xhr.status}`, }, },),
    );
  }
},);

// ── Init Alpine stores (idempotent) ────────────────────────
const initAlpineStores = (): void => {
  if (!globalThis.Alpine) { return; }
  try {
    if (Alpine.store("sidebar",)) { return; }
  } catch {
    /* store not defined yet */
  }
  Alpine.store("sidebar", { open: false, },);
  Alpine.store("chat", { currentChat: null, },);
  Alpine.store("ui", {
    showChatList: false,
    showGallery: false,
    showCharacterInfo: false,
    showUploadModal: false,
    showImportForm: false,
    showCreateForm: false,
    showEditModal: false,
    showPreviewModal: false,
    showChatSettings: false,
    showRenameModal: false,
    hasActiveChat: false,
  },);
};

// Init stores via alpine:init (fires when Alpine is ready) — this is the
// proper lifecycle hook. DOMContentLoaded and immediate calls are fallbacks.
document.addEventListener("alpine:init", initAlpineStores,);
initAlpineStores();
document.addEventListener("DOMContentLoaded", initAlpineStores,);

// Also trigger page loaders on initial page load (for direct navigation, not htmx)
document.addEventListener("DOMContentLoaded", triggerPageLoaders,);

// ── hx-on::after-request replacements (success events) ──────
document.addEventListener("htmx:afterRequest", (e: Event,) => {
  const detail = (e as CustomEvent<{ successful: boolean; elt: HTMLElement }>).detail;
  if (!detail.successful) { return; }
  const successEvent = detail.elt.dataset.hxSuccessEvent;
  if (successEvent) {
    document.dispatchEvent(new CustomEvent(successEvent,),);
  }
},);

document.addEventListener("asset:uploaded", () => {
  document.querySelector("#upload-modal",)?.classList.remove("open",);
  showToast("success", "Asset uploaded",);
  const grid = document.querySelector("#asset-grid",);
  if (grid) { htmx.trigger(grid, "load",); }
},);

document.addEventListener("character:created", () => {
  showToast("success", "Character created",);
  const grid = document.querySelector("#character-grid",);
  if (grid) { htmx.trigger(grid, "load",); }
},);

document.addEventListener("character:imported", () => {
  document.querySelector("#import-modal",)?.classList.remove("open",);
  showToast("success", "Character imported",);
  const grid = document.querySelector("#character-grid",);
  if (grid) { htmx.trigger(grid, "load",); }
},);

document.addEventListener("world:saved", () => {
  document.querySelector("#edit-world-modal",)?.classList.remove("open",);
  showToast("success", "World saved",);
  const detail = document.querySelector("#world-detail",);
  if (detail) { htmx.trigger(detail, "load",); }
},);

// ── Global keyboard: Escape closes sidebar ──────────────────
document.addEventListener("keydown", (e: KeyboardEvent,) => {
  if (e.key !== "Escape") { return; }
  const sidebar = document.querySelector("#layout-sidebar",);
  if (sidebar?.classList.contains("open",)) {
    closeSidebar();
  }
},);
