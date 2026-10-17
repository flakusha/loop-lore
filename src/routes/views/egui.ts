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
 * BOTH sides of the htmx ↔ egui handoff. This page does NOT re-implement the
 * contract: the back button delegates to `window.loopLoreEgui`
 * (src/frontend/egui-bridge.ts, the canonical TS implementation shared with
 * the htmx side). The Rust crate carries the only other copy, pure and
 * host-tested. Tickets: `TASK-htmx-to-egui-to-htmx-transfers-with-browser-side-context-sto`,
 * `TASK-egui-to-wasm-experimental-frontend-crate-json-client`.
 *
 * The module script is the only inline script on the page and carries the
 * per-request CSP nonce (`getNonce`). A missing `/egui/app.js` or
 * `/egui/app_bg.wasm` must never 500 the page: the failure lands in
 * `#egui-status` as visible text and the back button keeps working.
 */

import { getNonce, } from "../../middleware/csp-nonce";
import { escapeHtml, } from "./escape-html";

/** Text shown until wasm resolves (or replaces itself with the failure). */
const LOADING_STATUS = "Loading egui frontend\u2026";

/** Degenerate navigation target when the bridge bundle itself failed to load. */
const BRIDGE_FALLBACK_RETURN_TO = "/views/chat";

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
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
      }
      #egui-canvas {
        display: block;
        width: 100vw;
        height: 100vh;
      }
    </style>
  </head>
  <body>
    <script src="/egui-bridge.js" defer></script>
    <canvas id="egui-canvas"></canvas>
    <p id="egui-status">${LOADING_STATUS}</p>
    <button data-testid="egui-back-to-htmx" type="button">Back to htmx</button>
    <script nonce="${nonce}" type="module">
      const status = document.getElementById("egui-status");
      const back = document.querySelector("[data-testid='egui-back-to-htmx']");

      // The transfer contract (storage key, version, validation, navigation)
      // lives in egui-bridge.ts only — delegate instead of re-implementing it
      // here. The fallback covers a failed bundle load so the button still
      // leaves this page.
      if (back) {
        back.addEventListener("click", () => {
          if (window.loopLoreEgui) {
            window.loopLoreEgui.returnToHtmx();
          } else {
            location.assign("${BRIDGE_FALLBACK_RETURN_TO}");
          }
        });
      }

      // Dynamic import + catch (browser module, not TS): a missing wasm
      // asset must only set the status text, never throw an uncaught module
      // error.
      try {
        const glue = await import("/egui/app.js");
        // Default export loads app_bg.wasm relative to the glue; the wasm
        // start section then runs the Rust wasm-bindgen(start) mount.
        await glue.default();
        // SSE sink: the named exports of the same glue are the only Rust
        // entry point the bridge relays stream events into. Installed right
        // after the mount so no event can arrive before the sink exists.
        window.loopLoreEguiStream = {
          onUpdate: glue.egui_stream_update,
          onToolCall: glue.egui_stream_tool_call,
          onDone: glue.egui_stream_done,
          onError: glue.egui_stream_error,
        };
        // Gallery sink: thumbnail/upload callbacks from the bridge.
        window.loopLoreEguiGallery = {
          eguiThumbReady: glue.egui_thumb_ready,
          eguiThumbFailed: glue.egui_thumb_failed,
          eguiAssetUploaded: glue.egui_asset_uploaded,
        };
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
