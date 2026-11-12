// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Service-worker route classification (1.0.0 THEME 4, TASK-pwa-cached-shell
 * slice 1). Pure module — no ServiceWorker APIs — so bun test covers the
 * strategy table without a browser.
 *
 * Security posture: the SW never caches authenticated responses. `/api/*` is
 * network-only (not even intercepted) and `/views/*` HTML is fetched
 * network-first and never written to Cache Storage; the only cache fallback
 * for a dead network is the public static `/offline.html` page. Cache-first
 * applies exclusively to the public static shell allowlist (CSS, JS bundles,
 * icons, fonts, manifest, offline page, plus runtime-cached public asset
 * prefixes).
 */

/** Cache name version — bump when PRECACHE_URLS or shell semantics change. */
export const SW_CACHE_VERSION = "v1";

/** All SW-owned caches carry this prefix; activate purges other versions. */
export const CACHE_NAME_PREFIX = "loop-lore-shell";

/** @returns the Cache Storage name for the current shell version. */
export function cacheName(): string {
  return `${CACHE_NAME_PREFIX}-${SW_CACHE_VERSION}`;
}

/** Max milliseconds the SW waits for a `/views` HTML response before falling back. */
export const VIEW_NETWORK_TIMEOUT_MS = 5000;

/**
 * Public static shell precached at install. Bare bundle names (`/alpine-init.js`)
 * are served under the requested URL by the server's hashed-variant fallback,
 * so caching the bare URL caches the current build's content. Never list
 * `/api/*`, `/views/*`, or any authenticated surface here.
 */
export const PRECACHE_URLS: readonly string[] = [
  // Layout CSS (order mirrors src/views/layout.html)
  "/css/theme.css",
  "/css/theme-base.css",
  "/css/theme-default.css",
  "/css/app.css",
  "/css/gallery.css",
  "/css/vn.css",
  "/css/story.css",
  "/css/components/info-bubble.css",
  "/css/components/terminal-panel.css",
  "/css/components/audio-player.css",
  "/css/xterm.css",
  "/css/mobile-keynav.css",
  "/css/responsive.css",
  // Core JS bundles (server resolves each bare name to its hashed sibling)
  "/alpine-init.js",
  "/chat-vendor.js",
  "/pages.js",
  "/locale-init.js",
  // Brand + PWA surface
  "/favicon.svg",
  "/manifest.webmanifest",
  "/offline.html",
];

/** URL prefixes whose public static assets may be runtime-cached on first fetch. */
export const RUNTIME_CACHE_PREFIXES: readonly string[] = ["/css/", "/img/", "/locales/", "/components/",];

/** File extensions eligible for cache-first shell treatment. */
const SHELL_EXTENSIONS = new Set(["css", "js", "svg", "png", "jpg", "jpeg", "webp", "ico", "woff", "woff2", "json",],);

/** Bare bundle names served from dist/public that are part of the shell. */
const SHELL_BARE_NAMES = new Set([
  "/alpine-init.js",
  "/chat-vendor.js",
  "/pages.js",
  "/locale-init.js",
  "/manifest.webmanifest",
  "/offline.html",
  "/favicon.svg",
],);

/**
 * @param pathname - request pathname (leading slash)
 * @returns `true` when the path is public static shell surface eligible for caching.
 */
export function isShellAssetPath(pathname: string,): boolean {
  if (SHELL_BARE_NAMES.has(pathname,)) { return true; }
  if (!RUNTIME_CACHE_PREFIXES.some((p,) => pathname.startsWith(p,))) { return false; }
  const extension = pathname.split(".",).pop()?.toLowerCase() ?? "";
  return SHELL_EXTENSIONS.has(extension,);
}

/** Request classes the fetch handler distinguishes. */
export type RequestClass = "shell" | "view" | "api" | "passthrough";

/** Cache strategies the fetch handler implements. */
export type FetchStrategy = "cache-first" | "network-first-offline-page" | "network-only";

/**
 * Classify a fetch event's request. Non-GET, cross-origin, `/sw.js` itself and
 * anything outside the shell/view/api surfaces pass through untouched — the
 * browser's default network behavior applies and nothing is cached.
 * @param url - parsed request URL
 * @param method - HTTP method
 * @param mode - request mode (`"navigate"` for top-level document loads)
 * @param ownOrigin - the SW's origin (`self.location.origin`); empty in tests,
 *   which skips the cross-origin gate
 * @returns the request class
 */
export function classifyRequest(url: URL, method: string, mode: string, ownOrigin = "",): RequestClass {
  if (method.toUpperCase() !== "GET") { return "passthrough"; }
  if (ownOrigin !== "" && url.origin !== ownOrigin) { return "passthrough"; }
  if (url.pathname === "/sw.js") { return "passthrough"; }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/",)) { return "api"; }
  if (url.pathname === "/views" || url.pathname.startsWith("/views/",)) { return "view"; }
  if (mode === "navigate") { return "view"; }
  if (isShellAssetPath(url.pathname,)) { return "shell"; }
  return "passthrough";
}

/**
 * Strategy per request class. `network-only` means the fetch handler must NOT
 * call `respondWith` at all (default network semantics, zero caching).
 */
const STRATEGY_BY_CLASS: Record<RequestClass, FetchStrategy> = {
  shell: "cache-first",
  view: "network-first-offline-page",
  api: "network-only",
  passthrough: "network-only",
};

/**
 * Strategy for a classified request.
 * @param requestClass - class from {@link classifyRequest}
 * @returns the fetch strategy
 */
export function strategyFor(requestClass: RequestClass,): FetchStrategy {
  return STRATEGY_BY_CLASS[requestClass];
}
