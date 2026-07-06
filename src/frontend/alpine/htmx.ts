// ── 401 redirect helper ────────────────────────────────────

import { log as rootLog } from "./logger";

const log = rootLog.child({ module: "api" });
const API_BASE = "";

/** Get CSRF token from meta tag or cookie */
function getCsrfToken(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  if (meta?.content) return meta.content;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? match[1] : "";
}

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const method = options?.method ?? "GET";
  log.debug(`${method} ${url}`, { direction: "request" });
  const opts: RequestInit = { ...options };
  opts.headers = new Headers(opts.headers ?? {});
  const csrf = getCsrfToken();
  if (csrf) (opts.headers as Headers).set("X-CSRF-Token", csrf);
  opts.signal = AbortSignal.timeout(30_000);
  const res = await fetch(API_BASE + url, opts);
  log.debug(`${res.status} ${url}`, { direction: "response" });
  if (res.status === 401) {
    log.warn("401 — redirecting to login");
    const redirect = encodeURIComponent(location.pathname + location.search);
    location.assign(`/views/login?redirect=${redirect}`);
    throw new Error("Unauthorized");
  }
  return res;
}

// Prevent tree-shaking — Bun minifier removes unused top-level functions
globalThis.apiFetch = apiFetch;

// ── htmx event handlers ───────────────────────────────────

document.addEventListener("htmx:configRequest", (e: CustomEvent<{ headers: Record<string, string> }>) => {
  const token = localStorage.getItem("session_token");
  if (token) {
    e.detail.headers["Authorization"] = "Bearer " + token;
  }
});

// Cleanup Alpine components before swap to prevent memory leaks and state conflicts
document.addEventListener("htmx:beforeSwap", (e: CustomEvent<{ content: string }>) => {
  const swapTarget = document.querySelector("#app-root");
  if (swapTarget) {
    swapTarget.querySelectorAll("[x-data]").forEach((el) => {
      try {
        if (el && (globalThis as any).Alpine) {
          const data = (globalThis as any).Alpine.$data(el);
          if (data && typeof data.destroy === "function") {
            data.destroy();
          }
        }
      } catch {
        // Handle edge cases
      }
    });
  }
});

// Initialize Alpine only on new swapped content that has x-data attribute
document.addEventListener("htmx:load", (e: CustomEvent<{ elt: Element }>) => {
  const elt = e.detail.elt;
  if (elt && elt.getAttribute("x-data") && (globalThis as any).Alpine) {
    const appRoot = document.querySelector("#app-root");
    const shouldInit =
      // If element is inside app-root, init it
      appRoot?.contains(elt) ||
      // If it's an OOB swapped header element
      elt.id === "header-slot" ||
      false;

    if (shouldInit) {
      (globalThis as any).Alpine.initTree(elt);
    }
  }

  // Defer to next event loop turn so all htmx:load handlers for this
  // swap have fired before we touch the DOM.
  setTimeout(normalizeHeaderSlot, 0);
});

/** Ensure exactly one #header-slot exists, before #app-root */
function normalizeHeaderSlot() {
  const all = document.querySelectorAll("#header-slot");
  const appRoot = document.querySelector("#app-root");
  if (!appRoot || all.length === 0) return;

  // Find the best candidate inside #app-root — prefer the one with
  // children (actual content), last in DOM order (most recently added).
  let best: Element | null = null;
  let bestChildren = -1;
  for (const h of all) {
    if (!appRoot.contains(h)) {
      continue;
    }

    const n = h.children.length;
    if (n > bestChildren) {
      best = h;
      bestChildren = n;
    }
  }
  // Fallback: first header at body level (layout placeholder)
  if (!best) best = all[0];

  // Remove all others
  for (const h of all) {
    if (h !== best) h.remove();
  }

  // Move before #app-root if still inside it
  if (appRoot.contains(best)) {
    appRoot.parentElement?.insertBefore(best, appRoot);
  }
}

document.addEventListener("htmx:responseError", (e: CustomEvent<{ xhr?: XMLHttpRequest }>) => {
  if (e.detail.xhr) {
    try {
      const body = JSON.parse(e.detail.xhr.responseText);
      document.dispatchEvent(
        new CustomEvent("show-toast", {
          detail: { type: "error", message: body.error || "Request failed" },
        }),
      );
    } catch {
      document.dispatchEvent(
        new CustomEvent("show-toast", {
          detail: { type: "error", message: `Error ${e.detail.xhr.status}` },
        }),
      );
    }
  }
});
