// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Service-worker registration (1.0.0 THEME 4, TASK-pwa-cached-shell slice 1).
 *
 * Side-effect module imported by alpine-init.ts: registers /sw.js on window
 * load. CSP already allows the worker script (`worker-src 'self'` in the
 * headers config), so no nonce gymnastics are needed — the registration
 * failure path logs through the standard frontend logger instead of a silent
 * inline catch.
 */
import { log as rootLog, } from "../alpine/logger";

const log = rootLog.child({ module: "pwa", },);

/** @returns `true` when the browser exposes the serviceWorker API. */
function supportsServiceWorker(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Register /sw.js once the page has loaded, so the install fetches never
 * compete with first-paint requests. Failures are logged, never fatal.
 */
export function registerServiceWorker(): void {
  if (!supportsServiceWorker()) { return; }

  globalThis.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js",).catch((error: unknown,) => {
      log.warn("service worker registration failed", {
        error: error instanceof Error ? error.message : String(error,),
      },);
    },);
  },);
}

registerServiceWorker();
