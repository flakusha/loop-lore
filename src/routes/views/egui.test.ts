// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the /egui host page — a standalone document (no layout.html, no
 * htmx/Alpine bundles) carrying the canvas / status / back-button contract
 * and the CSP-nonce-stamped module script that boots the wasm bundle.
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
    expect(html,).toContain('wasm_bindgen("/egui/app.wasm")',);
    expect(html,).toContain('status.textContent = "egui failed to start: " + error',);
  });

  test("reads and re-writes the browser-side transfer context", async () => {
    const html = await renderPage();
    expect(html,).toContain("loop-lore.egui-context.v1",);
    expect(html,).toContain("localStorage.setItem(CONTEXT_KEY, JSON.stringify(context))",);
    expect(html,).toContain("location.assign(context.returnTo)",);
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
