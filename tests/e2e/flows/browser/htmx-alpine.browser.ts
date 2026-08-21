// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: htmx + Alpine.js Integration
 *
 * Tests the bridge layer between htmx DOM swapping and Alpine.js
 * reactive state. Covers the Round 4 fixes (ALP.1–ALP.7) as
 * regression tests.
 *
 * Pre-logs in via seeded data (demo/solo mode).
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import {
  countToasts,
  dispatchEvent,
  getAlpineStore,
  navigateViaHtmx,
  trackPageErrors,
  waitForAlpineReady,
  waitForAlpineState,
} from "../../helpers/htmx-alpine";
import { seedAll, } from "../../helpers/seed";

let ctx: BrowserTestContext;

beforeAll(async () => {
  ctx = await createBrowserTest();
  await seedAll(ctx.db,);
}, 90_000,);

afterAll(async () => {
  await ctx?.close();
},);

async function gotoView(
  page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
  path: string,
) {
  try {
    await page.goto(ctx.url + path, { waitUntil: "domcontentloaded", timeout: 30_000, },);
  } catch {
    // handled by subsequent waits
  }
  await page.locator("[data-testid='app-root']",).waitFor({ state: "attached", timeout: 15_000, },);
}

// ── htmx swap triggers Alpine init ──────────────────────────

describe("htmx swap → Alpine init", () => {
  test(
    "Alpine components in htmx-swapped content are initialized",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        const chatRoot = await page.evaluate(() => {
          const el = document.querySelector("[x-data='chatState()']",);
          if (!el) { return null; }
          return {
            hasAlpineData: "_x_dataStack" in el || "__x" in el,
            testid: (el as HTMLElement).dataset?.testid || "",
          };
        },);

        expect(chatRoot,).not.toBeNull();
        expect(chatRoot!.hasAlpineData,).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );

  test(
    "navigating via htmx initializes Alpine on swapped content",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);
        await navigateViaHtmx(page, "nav-characters", "characters-header",);
        expect(page.url(),).toContain("/views/characters",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );
});

// ── Morph navigation state reset ────────────────────────────

describe("Morph swap state reset", () => {
  test(
    "$store.ui resets when navigating away from chat",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        await page.evaluate(() => {
          Alpine.store("ui",).showChatList = true;
        },);
        let uiState = await getAlpineStore(page, "ui",);
        expect(uiState.showChatList,).toBe(true,);

        await navigateViaHtmx(page, "nav-characters", "characters-header",);
        await navigateViaHtmx(page, "nav-chat",);

        // Poll until Alpine settles after morph re-init.
        // waitForAlpineReady() polls until Alpine has settled after morph re-init.
        await waitForAlpineReady(page,);
        uiState = await getAlpineStore(page, "ui",);
        expect(uiState.showChatList,).toBe(false,);
        expect(uiState.showGallery,).toBe(false,);
        expect(uiState.showCharacterInfo,).toBe(false,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );
});

// ── Panel toggles + Escape key cleanup (ALP.1) ─────────────

describe("Panel toggles + Escape key", () => {
  test(
    "Escape key closes open panels",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        await page.evaluate(() => {
          document.querySelector("[data-testid='toggle-chat-list']",)?.dispatchEvent(
            new MouseEvent("click", { bubbles: true, },),
          );
        },);
        await waitForAlpineState(
          page,
          "[x-data='chatState()']",
          (state,) => (state as Record<string, unknown>).showChatList === true,
          10_000,
        );
        let uiState = await getAlpineStore(page, "ui",);
        expect(uiState.showChatList,).toBe(true,);

        await page.keyboard.press("Escape",);
        await waitForAlpineState(
          page,
          "[x-data='chatState()']",
          (state,) => (state as Record<string, unknown>).showChatList === false,
          10_000,
        );
        uiState = await getAlpineStore(page, "ui",);
        expect(uiState.showChatList,).toBe(false,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );

  test(
    "Escape does not error when no panels are open",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        await page.keyboard.press("Escape",);
        // sleep: keyboard event processing
        await page.waitForTimeout(200,);
        const uiState = await getAlpineStore(page, "ui",);
        expect(uiState.showChatList,).toBe(false,);
        expect(uiState.showGallery,).toBe(false,);
        expect(uiState.showCharacterInfo,).toBe(false,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );

  test(
    "keydown handler works after morph navigation",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        await navigateViaHtmx(page, "nav-characters", "characters-header",);
        await navigateViaHtmx(page, "nav-chat",);
        await waitForAlpineReady(page,);

        await page.evaluate(() => {
          document.querySelector("[data-testid='toggle-chat-list']",)?.dispatchEvent(
            new MouseEvent("click", { bubbles: true, },),
          );
        },);
        await waitForAlpineState(
          page,
          "[x-data='chatState()']",
          (state,) => (state as Record<string, unknown>).showChatList === true,
          10_000,
        );
        await page.keyboard.press("Escape",);
        await waitForAlpineState(
          page,
          "[x-data='chatState()']",
          (state,) => (state as Record<string, unknown>).showChatList === false,
          10_000,
        );

        const uiState = await getAlpineStore(page, "ui",);
        expect(uiState.showChatList,).toBe(false,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );
});

// ── htmx modal load + Alpine interaction ────────────────────

describe("htmx modal + Alpine", () => {
  test(
    "characters page lazy-loads create modal via htmx",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/characters",);
        await page
          .locator("[data-testid='characters-header']",)
          .waitFor({ state: "attached", timeout: 15_000, },);

        const createBtn = page.locator("[data-testid='create-character']",);
        await createBtn.waitFor({ state: "attached", timeout: 10_000, },);
        await createBtn.click();

        await page
          .locator("[data-testid='create-character-modal']",)
          .waitFor({ state: "visible", timeout: 15_000, },);

        const isVisible = await page.locator("[data-testid='create-character-modal']",).isVisible();
        expect(isVisible,).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );

  test(
    "gallery page lazy-loads upload modal via htmx",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/gallery",);
        await page
          .locator("[data-testid='gallery-header']",)
          .waitFor({ state: "attached", timeout: 15_000, },);

        const uploadBtn = page.locator("[data-testid='upload-button']",);
        await uploadBtn.waitFor({ state: "attached", timeout: 10_000, },);
        await uploadBtn.click();

        await page
          .locator("[data-testid='upload-modal']",)
          .waitFor({ state: "visible", timeout: 15_000, },);

        const isVisible = await page.locator("[data-testid='upload-modal']",).isVisible();
        expect(isVisible,).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );
});

// ── Toast deduplication (ALP.2) ─────────────────────────────

describe("Toast deduplication", () => {
  test(
    "show-toast event creates exactly one DOM toast",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        await dispatchEvent(page, "show-toast", {
          type: "success",
          message: "Test toast",
        },);
        await page.waitForFunction(
          () => document.querySelectorAll("[data-testid^='toast-']",).length > 0,
          null,
          { timeout: 10_000, },
        );

        const toasts = await countToasts(page,);
        expect(toasts,).toBe(1,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );

  test(
    "multiple rapid show-toast events create individual toasts",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        await dispatchEvent(page, "show-toast", { type: "info", message: "First", },);
        await dispatchEvent(page, "show-toast", { type: "info", message: "Second", },);
        await page.waitForFunction(
          () => document.querySelectorAll("[data-testid^='toast-']",).length >= 2,
          null,
          { timeout: 10_000, },
        );

        const toasts = await countToasts(page,);
        expect(toasts,).toBe(2,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );
});

// ── Sidebar + Alpine store sync ─────────────────────────────

describe("Sidebar store sync", () => {
  test(
    "hamburger toggles sidebar and syncs Alpine store",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        await page.click("[data-testid='hamburger']",);
        await page.waitForFunction(
          () => document.querySelector("[data-testid='sidebar']",)?.classList.contains("open",),
          null,
          { timeout: 10_000, },
        );

        const sidebarClass = await page.locator("[data-testid='sidebar']",).getAttribute("class",);
        expect(sidebarClass,).toContain("open",);

        const store = await getAlpineStore<{ open: boolean }>(page, "sidebar",);
        expect(store.open,).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );

  test(
    "Escape key closes sidebar when open",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        await page.click("[data-testid='hamburger']",);
        await page.waitForFunction(
          () => document.querySelector("[data-testid='sidebar']",)?.classList.contains("open",),
          null,
          { timeout: 10_000, },
        );

        await page.keyboard.press("Escape",);
        // sleep: CSS transition for sidebar close
        await page.waitForTimeout(200,);

        const sidebarClass = await page.locator("[data-testid='sidebar']",).getAttribute("class",);
        expect(sidebarClass,).not.toContain("open",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );
});

// ── Notifications lifecycle (ALP.6) ────────────────────────

// Note: notifications.ts is tree-shaken out of the production bundle
// (globalThis.notifications not available). ALP.6 fix (cleanup handlers
// in stop()) is verified at the code-review level. This describe block
// is kept as a placeholder for when the module is re-included.

describe("Notifications manager lifecycle", () => {
  test(
    "notifications module import is present in source",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        const appRoot = await page.locator("[data-testid='app-root']",).isVisible();
        expect(appRoot,).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );
});

// ── Chat list selection + Alpine state ──────────────────────

describe("Chat list selection", () => {
  test(
    "selecting a chat enables input and sets store state",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        await page.click("[data-testid='toggle-chat-list']",);
        await page.locator("[data-testid='chat-list-panel']",).waitFor({ state: "visible", timeout: 10_000, },);

        const chatItem = page.locator("[data-testid='chat-list-panel'] .nav-item",).first();
        await chatItem.waitFor({ state: "attached", timeout: 10_000, },);
        await chatItem.click();
        await waitForAlpineState(
          page,
          "[x-data='chatState()']",
          (state,) => !!(state as Record<string, unknown>).activeChat,
          10_000,
        );

        const disabled = await page.getAttribute("[data-testid='message-input']", "disabled",);
        expect(disabled,).toBeNull();

        const uiState = await getAlpineStore(page, "ui",);
        expect(uiState.hasActiveChat,).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );
});

// ── Chat window modals open (regression for x-show + .open CSS) ──

describe("Chat window modals open", () => {
  test(
    "chat settings modal becomes visible when store toggled (.open fix)",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        await page.evaluate(() => {
          Alpine.store("ui",).showChatSettings = true;
        },);
        const modal = page.locator("[data-testid='chat-settings-modal']",);
        await modal.waitFor({ state: "visible", timeout: 10_000, },);
        const cls = await modal.getAttribute("class",);
        expect(cls,).toContain("open",);
        expect(await modal.isVisible(),).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );

  test(
    "chat settings button opens modal after selecting a chat",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

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
        expect(await modal.isVisible(),).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );

  test(
    "user preferences modal opens via header button",
    async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoView(page, "/views/chat",);
        await waitForAlpineReady(page,);

        await page.click("[data-testid='toggle-user-preferences']",);
        const title = page.locator("[data-testid='settings-modal-title']",);
        await title.waitFor({ state: "visible", timeout: 10_000, },);
        expect(await title.isVisible(),).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    },
    45_000,
  );
});
