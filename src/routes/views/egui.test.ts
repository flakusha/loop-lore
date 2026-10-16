// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the /egui host page — a standalone document (no layout.html, no
 * htmx/Alpine bundles) carrying the canvas / status / back-button contract
 * and the CSP-nonce-stamped module script that boots the wasm bundle.
 *
 * The browser-side transfer context is NOT re-implemented here: the page
 * loads the shared bridge bundle and delegates (src/frontend/egui-bridge.ts
 * is the canonical TS implementation).
 */
import { describe, expect, test, } from "bun:test";
import { generateNonce, } from "../../middleware/csp-nonce";
import { serveEguiFrontendPage, } from "./egui";

/**
 * @returns the rendered page body
 */
async function renderPage(request = new Request("http://test/egui",),): Promise<string> {
  return await serveEguiFrontendPage(request,).text();
}

describe("serveEguiFrontendPage", () => {
  test("renders the standalone document contract", async () => {
    const res = serveEguiFrontendPage(new Request("http://test/egui",),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("Content-Type",),).toBe("text/html; charset=utf-8",);

    const html = await res.text();
    expect(html.startsWith("<!-- SPDX-License-Identifier: Apache-2.0 -->",),).toBe(true,);
    expect(html,).toContain("<!doctype html>",);
    expect(html,).toContain("<title>",);
    expect(html,).toContain('<canvas id="egui-canvas"></canvas>',);
    expect(html,).toContain('<p id="egui-status">Loading egui frontend',);
    expect(html,).toContain('<button data-testid="egui-back-to-htmx" type="button">Back to htmx</button>',);
  });

  test("boots the wasm bundle and degrades to the status line", async () => {
    const html = await renderPage();
    expect(html,).toContain('import("/egui/app.js")',);
    expect(html,).toContain("await glue.default()",);
    expect(html,).toContain('status.textContent = "egui failed to start: " + error',);
  });

  test("delegates the transfer context to the shared bridge bundle", async () => {
    const html = await renderPage();
    // The /egui page is rendered per-request, so it cannot go through hash
    // injection: the bridge is emitted under a stable name (build-frontend.mjs).
    expect(html,).toContain('<script src="/egui-bridge.js" defer></script>',);
    expect(html,).toContain("window.loopLoreEgui.returnToHtmx()",);
    expect(html,).toContain('location.assign("/views/chat")',);
    // The page must NOT re-implement the contract: the storage key and the
    // parse/validate rules live in src/frontend/egui-bridge.ts only.
    expect(html,).not.toContain("loop-lore.egui-context.v1",);
  });

  test("stamps the CSP nonce on the inline module script", async () => {
    const request = new Request("http://test/egui",);
    const nonce = generateNonce(request,);
    const html = await renderPage(request,);
    expect(html,).toContain(`<script nonce="${nonce}" type="module">`,);
  });

  test("renders a usable (nonce-less) page when no nonce was generated", async () => {
    const html = await renderPage();
    expect(html,).toContain('<script nonce="" type="module">',);
  });

  test("carries no htmx or Alpine bundle markers", async () => {
    const html = await renderPage();
    expect(html,).not.toContain("hx-",);
    expect(html,).not.toContain("x-data",);
    expect(html,).not.toContain("alpine",);
  });
});
