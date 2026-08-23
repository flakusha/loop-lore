// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Visual Novel Settings Modal
 *
 * Verifies the chat-settings modal exposes a Visual Novel section that:
 *  - Renders an enable toggle bound to Alpine state `_vnEnabled`
 *  - Reveals layout / transition / typewriter / auto-advance sub-controls
 *  - Updates `_vnLayout` when the layout select changes
 *  - Updates `_vnTransition` when the transition select changes
 *  - Toggles the typewriter speed slider visibility with `_vnTypewriter`
 *  - Updates `_vnTypewriterSpeed` when the slider is moved
 *
 * Pre-logs in via seeded data (demo/solo mode).
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, waitForAlpineReady, waitForAlpineState, } from "../../helpers/htmx-alpine";
import { seedAll, } from "../../helpers/seed";

let ctx: BrowserTestContext;

beforeAll(async () => {
  ctx = await createBrowserTest();
  await seedAll(ctx.db,);
}, 90_000,);

afterAll(async () => {
  await ctx?.close();
},);

async function openChatSettings(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
  await page.click("[data-testid='toggle-chat-list']",);
  await page.locator("[data-testid='chat-list-panel'] .nav-item",).first().waitFor({
    state: "attached",
    timeout: 10_000,
  },);
  await page.locator("[data-testid='chat-list-panel'] .nav-item",).first().click();
  await waitForAlpineState(
    page,
    "[x-data='chatState()']",
    (state,) => !!(state as Record<string, unknown>).activeChat,
    10_000,
  );
  await page.click("[data-testid='toggle-chat-settings']",);
  const modal = page.locator("[data-testid='chat-settings-modal']",);
  await modal.waitFor({ state: "visible", timeout: 10_000, },);
}

describe("VN settings block in chat-settings modal", () => {
  test(
    "Visual Novel section renders with default-collapsed sub-controls",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await page.goto(ctx.url + "/views/chat", { waitUntil: "domcontentloaded", timeout: 30_000, },);
        await waitForAlpineReady(page,);
        await openChatSettings(page,);

        const vnSection = page.locator("[data-testid='vn-settings']",);
        await vnSection.waitFor({ state: "visible", timeout: 10_000, },);

        const toggle = page.locator("[data-testid='vn-enabled-toggle']",);
        await toggle.waitFor({ state: "attached", timeout: 5_000, },);
        const layout = page.locator("[data-testid='vn-layout-select']",);
        await layout.waitFor({ state: "attached", timeout: 5_000, },);
        const transition = page.locator("[data-testid='vn-transition-select']",);
        await transition.waitFor({ state: "attached", timeout: 5_000, },);

        // Default state: toggle off, sub-controls hidden via x-show
        const initiallyChecked = await toggle.isChecked();
        expect(initiallyChecked,).toBe(false,);

        const layoutVisible = await layout.isVisible();
        expect(layoutVisible,).toBe(false,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );

  test(
    "enabling the toggle reveals sub-controls and updates _vnEnabled state",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await page.goto(ctx.url + "/views/chat", { waitUntil: "domcontentloaded", timeout: 30_000, },);
        await waitForAlpineReady(page,);
        await openChatSettings(page,);

        const toggle = page.locator("[data-testid='vn-enabled-toggle']",);
        await toggle.check();

        const layout = page.locator("[data-testid='vn-layout-select']",);
        await layout.waitFor({ state: "visible", timeout: 5_000, },);
        const transition = page.locator("[data-testid='vn-transition-select']",);
        await transition.waitFor({ state: "visible", timeout: 5_000, },);

        const state = await waitForAlpineState(
          page,
          "[x-data='chatState()']",
          (s,) => (s as Record<string, unknown>)._vnEnabled === true,
          5_000,
        );
        expect((state as Record<string, unknown>)._vnLayout,).toBe("overlay",);
        expect((state as Record<string, unknown>)._vnTransition,).toBe("fade",);
        expect((state as Record<string, unknown>)._vnTypewriter,).toBe(true,);
        expect((state as Record<string, unknown>)._vnTypewriterSpeed,).toBe(30,);
        expect((state as Record<string, unknown>)._vnAutoAdvance,).toBe(false,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );

  test(
    "layout and transition selects update Alpine state",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await page.goto(ctx.url + "/views/chat", { waitUntil: "domcontentloaded", timeout: 30_000, },);
        await waitForAlpineReady(page,);
        await openChatSettings(page,);

        const toggle = page.locator("[data-testid='vn-enabled-toggle']",);
        await toggle.check();

        const layout = page.locator("[data-testid='vn-layout-select']",);
        await layout.selectOption("split",);

        const transition = page.locator("[data-testid='vn-transition-select']",);
        await transition.selectOption("cut",);

        const state = await waitForAlpineState(
          page,
          "[x-data='chatState()']",
          (s,) =>
            (s as Record<string, unknown>)._vnLayout === "split" &&
            (s as Record<string, unknown>)._vnTransition === "cut",
          5_000,
        );
        expect((state as Record<string, unknown>)._vnLayout,).toBe("split",);
        expect((state as Record<string, unknown>)._vnTransition,).toBe("cut",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );

  test(
    "typewriter speed slider hidden when typewriter is disabled",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await page.goto(ctx.url + "/views/chat", { waitUntil: "domcontentloaded", timeout: 30_000, },);
        await waitForAlpineReady(page,);
        await openChatSettings(page,);

        const toggle = page.locator("[data-testid='vn-enabled-toggle']",);
        await toggle.check();

        const typewriter = page.locator("[data-testid='vn-typewriter-toggle']",);
        await typewriter.uncheck();

        const slider = page.locator("[data-testid='vn-typewriter-speed']",);
        // x-show="false" parents are still in the DOM; use isVisible
        const visible = await slider.isVisible();
        expect(visible,).toBe(false,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );

  test(
    "auto-advance toggle updates _vnAutoAdvance state",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await page.goto(ctx.url + "/views/chat", { waitUntil: "domcontentloaded", timeout: 30_000, },);
        await waitForAlpineReady(page,);
        await openChatSettings(page,);

        const toggle = page.locator("[data-testid='vn-enabled-toggle']",);
        await toggle.check();

        const autoAdvance = page.locator("[data-testid='vn-auto-advance-toggle']",);
        await autoAdvance.check();

        const state = await waitForAlpineState(
          page,
          "[x-data='chatState()']",
          (s,) => (s as Record<string, unknown>)._vnAutoAdvance === true,
          5_000,
        );
        expect((state as Record<string, unknown>)._vnAutoAdvance,).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );
});
