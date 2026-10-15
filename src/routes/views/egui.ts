// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * egui WASM frontend host page (`GET /egui`).
 *
 * A standalone full HTML document — deliberately NOT layout.html: no htmx
 * bundle, no Alpine, no i18n injection. The `<canvas>` must live outside
 * every htmx swap target so a fragment swap can never tear down the egui
 * WebGL context mid-transfer.
 *
 * Browser-side transfer context (`loop-lore.egui-context.v1`) is written by
 * BOTH sides of the htmx ↔ egui handoff; this page reads it on load and the
 * back button re-writes it before returning to the htmx frontend. See
 * .tmp/egui-contract.md for the authoritative shape.
 *
 * The module script is the only inline script on the page and carries the
 * per-request CSP nonce (`getNonce`). A missing `/egui/app.js` or
 * `/egui/app.wasm` must never 500 the page: the failure lands in
 * `#egui-status` as visible text and the back button keeps working.
 */

import { getNonce, } from "../../middleware/csp-nonce";
import { escapeHtml, } from "./escape-html";

/**
 * localStorage key for the htmx ↔ egui transfer context — interpolated into
 * the page script so the key lives in exactly one place server-side.
 */
const CONTEXT_KEY = "loop-lore.egui-context.v1";

/** Origin-absolute fallback when no context is stored (or it is malformed). */
const DEFAULT_RETURN_TO = "/views/chat";

/** Text shown until wasm resolves (or replaces itself with the failure). */
const LOADING_STATUS = "Loading egui frontend\u2026";

/**
 * Serve the egui host page.
 *
 * @param request - incoming request (only the CSP nonce is read from it)
 * @returns the standalone HTML document for `GET /egui`
 */
export function serveEguiFrontendPage(request: Request,): Response {
  // The response-header middleware generates a nonce for every request, so
  // this is present in practice; the empty string keeps a direct call (unit
  // test) rendering valid markup instead of `nonce="null"`.
  const nonce = escapeHtml(getNonce(request,) ?? "",);

  const body = `<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>egui frontend \u2014 Loop Lore</title>
  </head>
  <body>
    <canvas id="egui-canvas"></canvas>
    <p id="egui-status">${LOADING_STATUS}</p>
    <button data-testid="egui-back-to-htmx" type="button">Back to htmx</button>
    <script nonce="${nonce}" type="module">
      const CONTEXT_KEY = "${CONTEXT_KEY}";
      const DEFAULT_RETURN_TO = "${DEFAULT_RETURN_TO}";
      const status = document.getElementById("egui-status");
      const back = document.querySelector("[data-testid='egui-back-to-htmx']");

      // Transfer context written by the htmx side on handoff. Malformed JSON,
      // a wrong version or non-string fields fall back to the default so a
      // corrupt entry can never strand the user on this page.
      let context = { version: 1, activeChatId: null, returnTo: DEFAULT_RETURN_TO };
      try {
        const parsed = JSON.parse(localStorage.getItem(CONTEXT_KEY) || "null");
        if (parsed && parsed.version === 1 && typeof parsed.returnTo === "string" && parsed.returnTo.startsWith("/")) {
          context = {
            version: 1,
            activeChatId: typeof parsed.activeChatId === "string" ? parsed.activeChatId : null,
            returnTo: parsed.returnTo,
          };
        }
      } catch {
        // keep the default context
      }

      // Listener (not an inline handler): CSP script-src has no 'unsafe-inline'.
      if (back) {
        back.addEventListener("click", () => {
          try {
            localStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
          } catch {
            // storage unavailable — navigation still works
          }
          location.assign(context.returnTo);
        });
      }

      // Dynamic import + catch (browser module, not TS): a missing wasm asset
      // must only set the status text, never throw an uncaught module error.
      try {
        const glue = await import("/egui/app.js");
        await glue.wasm_bindgen("/egui/app.wasm");
        if (status) { status.textContent = "egui ready"; }
      } catch (error) {
        if (status) { status.textContent = "egui failed to start: " + error; }
      }
    </script>
  </body>
</html>`;

  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8", },
  },);
}
