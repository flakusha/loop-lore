/**
 * htmx + Alpine.js Test Helpers
 *
 * Shared utilities for browser E2E tests that verify the htmx/Alpine
 * integration layer.
 */

import type { Page, } from "@playwright/test";

// ── Wait for Alpine ─────────────────────────────────────────

/**
 * Wait for Alpine.js to be fully initialized and stores to be available.
 */
export function waitForAlpineReady(page: Page, timeoutMs = 5000,): Promise<void> {
  return page.evaluate(
    (timeout,) =>
      new Promise<void>((resolve, reject,) => {
        const start = Date.now();
        const check = () => {
          if (typeof Alpine !== "undefined" && Alpine.store("ui",)) {
            resolve();
          } else if (Date.now() - start > timeout) {
            reject(new Error("Alpine not ready within timeout",),);
          } else {
            setTimeout(check, 50,);
          }
        };
        check();
      },),
    timeoutMs,
  );
}

// ── Navigate via htmx click ─────────────────────────────────

/**
 * Click an htmx-enabled sidebar link and wait for the target content
 * to appear in the DOM. Uses element presence as the swap completion
 * signal (proven pattern from existing tests).
 */
export async function navigateViaHtmx(
  page: Page,
  testid: string,
  targetTestid?: string,
  timeoutMs = 8000,
): Promise<void> {
  // Use page.evaluate to click — Playwright's click({ force: true })
  // still rejects "outside of the viewport" in headless Chromium.
  // Nav links are always in the DOM and htmx interception doesn't
  // depend on visual position.
  await page.evaluate((sel,) => {
    const el = document.querySelector(sel,);
    if (el instanceof HTMLElement) { el.click(); }
  }, `[data-testid='${testid}']`,);
  // Wait for the target element (or app-root) to confirm swap completed
  const target = targetTestid ? `[data-testid='${targetTestid}']` : "[data-testid='app-root']";
  await page.locator(target,).waitFor({ state: "attached", timeout: timeoutMs, },);
  // Small settle for Alpine reactivity
  await page.waitForTimeout(100,);
}

// ── Alpine store access ─────────────────────────────────────

/**
 * Read an Alpine store's state via page.evaluate.
 */
export async function getAlpineStore<T = Record<string, unknown>,>(
  page: Page,
  storeName: string,
): Promise<T> {
  return page.evaluate((name,) => {
    if (typeof Alpine === "undefined") { throw new Error("Alpine not loaded",); }
    // structuredClone fails on Alpine Proxy objects (DataCloneError).
    // JSON round-trip strips proxies and React-like internals safely.
    return structuredClone(Alpine.store(name,),);
  }, storeName,) as Promise<T>;
}

// ── DOM toast counting ──────────────────────────────────────

/**
 * Count visible toast elements in the toast container.
 */
export async function countToasts(page: Page,): Promise<number> {
  return page.evaluate(() => {
    const container = document.querySelector("#toast-container",);
    return container ? container.querySelectorAll(".toast",).length : 0;
  },);
}

// ── Dispatch custom event ───────────────────────────────────

/**
 * Dispatch a custom event on the document from within the page.
 */
export async function dispatchEvent(
  page: Page,
  eventName: string,
  detail?: unknown,
): Promise<void> {
  await page.evaluate(
    ({ name, det, },) => {
      document.dispatchEvent(new CustomEvent(name, { detail: det, },),);
    },
    { name: eventName, det: detail, },
  );
}

// ── Alpine component check ──────────────────────────────────

/**
 * Check if an element has been initialized by Alpine (has _x_dataStack).
 */
export async function isAlpineInitialized(page: Page, selector: string,): Promise<boolean> {
  return page.evaluate((sel,) => {
    const el = document.querySelector(sel,);
    if (!el) { return false; }
    return "_x_dataStack" in el || "__x" in el || "_x_ignore" in el;
  }, selector,);
}
