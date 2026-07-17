/**
 * Unified Frontend fetch utility.
 *
 * Wraps the native `fetch` and injects the cross-site-request-forgery token
 * (from a <meta name="csrf-token"> tag or the `csrf_token` cookie) and the
 * session bearer token (from `localStorage.session_token`) on every request.
 * On a 401 it redirects to the login page — mirroring the behaviour the HTMX
 * layer applies to its own requests via `htmx:configRequest`.
 *
 * This is the single canonical request helper for non-Alpine (vanilla) pages.
 * Alpine/chat code keeps `apiFetch` (alpine/htmx.ts) which delegates here so the
 * header + 401 logic lives in exactly one place.
 */

const API_BASE = "";

function getCsrfToken(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  if (meta?.content) return meta.content;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match?.[1] ?? "";
}

export async function feFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const opts: RequestInit = { ...options };
  opts.headers = new Headers(opts.headers ?? {});
  const csrf = getCsrfToken();
  if (csrf) (opts.headers as Headers).set("X-CSRF-Token", csrf);
  const token = localStorage.getItem("session_token");
  if (token) (opts.headers as Headers).set("Authorization", `Bearer ${token}`);
  opts.signal = AbortSignal.timeout(30_000);
  const res = await fetch(API_BASE + url, opts);
  if (res.status === 401) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    location.assign(`/views/login?redirect=${redirect}`);
    throw new Error("Unauthorized");
  }
  return res;
}
