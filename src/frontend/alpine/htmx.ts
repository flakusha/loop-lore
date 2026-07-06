// Minimal inline logging — avoids logger module's SERVER_LOG_BUFFER.push issue in minified bundle
const __log = (level: string, msg: string, meta?: unknown) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] [api] ${msg}`, meta ?? "");
};

// Global error capture for debugging page loader issues
addEventListener("error", (e) => {
  __log("ERROR", `Uncaught: ${e.message}`, { filename: e.filename, lineno: e.lineno, colno: e.colno });
});

const API_BASE = "";

function getCsrfToken(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  if (meta?.content) return meta.content;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? match[1] : "";
}

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const method = options?.method ?? "GET";
  const start = performance.now();
  __log("INFO", `${method} ${url}`, { direction: "request" });
  const opts: RequestInit = { ...options };
  opts.headers = new Headers(opts.headers ?? {});
  const csrf = getCsrfToken();
  if (csrf) (opts.headers as Headers).set("X-CSRF-Token", csrf);
  opts.signal = AbortSignal.timeout(30_000);
  const res = await fetch(API_BASE + url, opts);
  const elapsed = Math.round(performance.now() - start);
  __log("INFO", `${res.status} ${url}`, { direction: "response", elapsedMs: elapsed });
  if (res.status === 401) {
    __log("WARN", `401 — redirecting to login`, { url });
    const redirect = encodeURIComponent(location.pathname + location.search);
    location.assign(`/views/login?redirect=${redirect}`);
    throw new Error("Unauthorized");
  }
  return res;
}

globalThis.apiFetch = apiFetch;

export {};

// ── htmx event handlers ───────────────────────────────────

document.addEventListener("htmx:configRequest", (e: CustomEvent<{ headers: Record<string, string> }>) => {
  __log("DEBUG", "htmx:configRequest", { path: (e as any)?.detail?.path });
  const token = localStorage.getItem("session_token");
  if (token) {
    e.detail.headers["Authorization"] = "Bearer " + token;
  }
});

document.addEventListener("htmx:beforeSwap", () => {
  __log("DEBUG", "htmx:beforeSwap");
});

// Trigger page-specific loaders on htmx content swaps
function triggerPageLoaders(): void {
  if (document.querySelector("#character-grid")) {
    (globalThis as any).loadCharactersPage?.();
  }
  if (document.querySelector("#gallery-grid")) {
    (globalThis as any).loadGalleryPage?.();
  }
  if (document.querySelector("#worlds-list")) {
    (globalThis as any).loadWorldsPage?.();
  }
}

document.addEventListener("htmx:load", (e: CustomEvent<{ elt: Element }>) => {
  const elt = e.detail.elt;
  __log("DEBUG", "htmx:load", { tag: elt?.tagName, id: (elt as any)?.id });
  if (elt && globalThis.Alpine && elt.querySelector("[x-data]")) {
    elt.querySelectorAll("[x-data]").forEach((child: Element) => {
      Alpine!.initTree(child as HTMLElement);
    });
  }
  triggerPageLoaders();
  // Remove duplicate header-slot from #app-root after navigation
  normalizeHeaderSlot();
});

function normalizeHeaderSlot() {
  const all = document.querySelectorAll("#header-slot");
  const appRoot = document.querySelector("#app-root");
  if (!appRoot || all.length === 0) return;
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
  if (!best) best = all[0];
  for (const h of all) {
    if (h !== best) h.remove();
  }
  if (appRoot.contains(best)) {
    appRoot.parentElement?.insertBefore(best, appRoot);
  }
}

document.addEventListener("htmx:responseError", (e: CustomEvent<{ xhr?: XMLHttpRequest }>) => {
  const xhr = e.detail.xhr;
  if (!xhr) return;
  try {
    const body = JSON.parse(xhr.responseText);
    const msg = (body as any)?.error || `Error ${xhr.status}`;
    document.dispatchEvent(new CustomEvent("show-toast", { detail: { type: "error", message: msg } }));
  } catch {
    document.dispatchEvent(
      new CustomEvent("show-toast", { detail: { type: "error", message: `Error ${xhr.status}` } }),
    );
  }
});

// ── Init Alpine stores (idempotent) ────────────────────────
const initAlpineStores = (): void => {
  if (!globalThis.Alpine) return;
  try {
    if (Alpine.store("sidebar")) return;
  } catch {
    /* store not defined yet */
  }
  Alpine.store("sidebar", { open: false });
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
    hasActiveChat: false,
  });
};

// Try to init stores immediately and on DOMContentLoaded
initAlpineStores();
document.addEventListener("DOMContentLoaded", initAlpineStores);

// Also trigger page loaders on initial page load (for direct navigation, not htmx)
document.addEventListener("DOMContentLoaded", triggerPageLoaders);

// ── Global keyboard: Escape closes sidebar ──────────────────
document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key !== "Escape") return;
  const sidebar = document.querySelector("#layout-sidebar");
  if (sidebar?.classList.contains("open")) {
    closeSidebar();
  }
});
