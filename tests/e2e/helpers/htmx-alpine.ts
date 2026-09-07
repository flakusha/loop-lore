// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * htmx + Alpine.js Test Helpers
 *
 * Shared utilities for browser E2E tests that verify the htmx/Alpine
 * integration layer.
 */

import type { Page, } from "@playwright/test";

// ── Page error tracking ─────────────────────────────────────

/**
 * Collect page errors (uncaught exceptions) and console.error messages for a page.
 * Wire in before the interesting interaction, then call `assertNoPageErrors` after.
 * Returns a collector object with `errors`, `assert()`, and `detach()`.
 */
export function trackPageErrors(
  page: Page,
  options: { allowlist?: RegExp[] } = {},
): { errors: string[]; assert: () => void; detach: () => void } {
  const errors: string[] = [];
  const allowlist = options.allowlist ?? [];

  const onPageError = (error: Error,) => {
    const msg = `pageerror: ${error.message}`;
    if (allowlist.every((re,) => !re.test(msg,))) { errors.push(msg,); }
  };
  const onConsole = (message: import("@playwright/test").ConsoleMessage,) => {
    if (message.type() !== "error") { return; }
    const msg = `console.error: ${message.text()}`;
    if (allowlist.every((re,) => !re.test(msg,))) { errors.push(msg,); }
  };

  page.on("pageerror", onPageError,);
  page.on("console", onConsole,);

  return {
    errors,
    assert: () => {
      if (errors.length > 0) {
        throw new Error(`Page errors detected (${errors.length}):\n${errors.join("\n",)}`,);
      }
    },
    detach: () => {
      page.off("pageerror", onPageError,);
      page.off("console", onConsole,);
    },
  };
}

/**
 * Assert no page errors occurred since tracking started. Throws with collected
 * messages otherwise. Call at end of test (after the interesting interaction).
 */
export async function assertNoPageErrors(page: Page, options: { allowlist?: RegExp[] } = {},): Promise<void> {
  const tracker = trackPageErrors(page, options,);
  // Give the event loop a beat so late errors are captured, then assert.
  await page.waitForTimeout(50,);
  tracker.assert();
  tracker.detach();
}

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
          // Wait for both: Alpine store exists AND Alpine has processed DOM elements
          // (x-on:click handlers attached, _x_dataStack present on x-data elements)
          const storeReady = typeof Alpine !== "undefined" && Alpine.store("ui",);
          const domReady = (document.querySelector("[x-data]",) as any)?._x_dataStack;
          if (storeReady && domReady) {
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
    // JSON round-trip strips Alpine Proxy objects safely.
    return JSON.parse(JSON.stringify(Alpine.store(name,),),);
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

// ── Alpine component-local state ────────────────────────────

/**
 * Read a component's local reactive state via Alpine's internal data.
 * Prefers `__x.getUnobservedData()` (keeps functions intact, strips Proxy),
 * falls back to `Alpine.$data(el)`.
 */
export async function getAlpineData<T = Record<string, unknown>,>(
  page: Page,
  selector: string,
): Promise<T> {
  return page.evaluate((sel,) => {
    const el = document.querySelector(sel,);
    if (!el) {
      throw new Error(`Element not found for Alpine state: ${sel}`,);
    }
    const alpineEl = el as unknown as { __x?: { getUnobservedData?: () => unknown } };
    const x = alpineEl.__x;
    // Alpine's runtime global exposes $data(el) but ships no ambient type in this scope.
    const alpineGlobal = (globalThis as Record<string, unknown>).Alpine as
      | { $data?: (el: Element,) => unknown }
      | undefined;
    const raw = x?.getUnobservedData
      ? x.getUnobservedData()
      : alpineGlobal?.$data?.(el,);
    if (raw === undefined || raw === null) {
      throw new Error(`Alpine state not available on ${sel} (element not initialized)`,);
    }
    return JSON.parse(JSON.stringify(raw,),);
  }, selector,) as Promise<T>;
}

/**
 * Web-first poll for an Alpine component state predicate to hold.
 * Replaces fixed waitForTimeout sleeps in state-assertion tests.
 */
export async function waitForAlpineState<T = Record<string, unknown>,>(
  page: Page,
  selector: string,
  predicate: (state: T,) => boolean,
  timeoutMs = 8000,
): Promise<T> {
  const start = Date.now();
  let lastState: T | undefined;
  let lastError: unknown;
  for (;;) {
    try {
      lastState = await getAlpineData<T>(page, selector,);
      if (predicate(lastState,)) { return lastState; }
    } catch (error) {
      lastError = error;
    }
    if (Date.now() - start > timeoutMs) {
      const errorSuffix = lastError ? ` Last error: ${String(lastError,)}` : "";
      throw new Error(
        `waitForAlpineState timed out after ${timeoutMs}ms for '${selector}'. ` +
          `Last state: ${JSON.stringify(lastState,)}${errorSuffix}`,
      );
    }
    await page.waitForTimeout(100,);
  }
}
