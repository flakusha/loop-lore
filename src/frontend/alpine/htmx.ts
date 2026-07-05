// ── 401 redirect helper ────────────────────────────────────

const API_BASE = "";

/** Get CSRF token from meta tag or cookie */
function getCsrfToken(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  if (meta?.content) return meta.content;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? match[1] : "";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const opts: RequestInit = { ...options };
  opts.headers = new Headers(opts.headers ?? {});
  const csrf = getCsrfToken();
  if (csrf) (opts.headers as Headers).set("X-CSRF-Token", csrf);
  opts.signal = AbortSignal.timeout(30_000);
  const res = await fetch(API_BASE + url, opts);
  if (res.status === 401) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    location.assign(`/views/login?redirect=${redirect}`);
    throw new Error("Unauthorized");
  }
  return res;
}

// ── htmx event handlers ───────────────────────────────────

document.addEventListener("htmx:configRequest", (e: CustomEvent<{ headers: Record<string, string> }>) => {
  const token = localStorage.getItem("session_token");
  if (token) {
    e.detail.headers["Authorization"] = "Bearer " + token;
  }
});

document.addEventListener("htmx:afterSwap", (e: CustomEvent<{ target: Element }>) => {
  const target = e.detail.target as HTMLElement & { __x?: { $nextTick: (fn: () => void) => void } };
  if (target && target.__x) {
    target.__x.$nextTick(() => {
      globalThis.Alpine?.initTree(target);
    });
  }
});

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

 
 
 

