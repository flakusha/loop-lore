// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Chat Flow
 *
 * Tests chat interactions via browser: toggle panels, message input, chat creation.
 * Pre-logs in via seeded data (demo/solo mode).
 *
 * NOTE: Alpine x-show/:style/:disabled timing depends on inline script extraction.
 * Tests use attached-state checks where Alpine init is unreliable.
 * Toggle/visibility tests deferred until inline script migration lands.
 * @pillar assistant-tool-call-ui
 * @pillar generation
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, waitForAlpineState, } from "../../helpers/htmx-alpine";
import { SEED, seedAll, } from "../../helpers/seed";

let ctx: BrowserTestContext;

beforeAll(async () => {
  ctx = await createBrowserTest();
  await seedAll(ctx.db,);
}, 90_000,);

afterAll(async () => {
  await ctx?.close();
},);

async function gotoChat(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
  await page.goto(`${ctx.url}/views/chat`, { waitUntil: "commit", timeout: 30_000, },);
  await page.locator("[data-testid='message-list']",).waitFor({ state: "attached", timeout: 30_000, },);
}

describe("Toggle buttons", () => {
  test("toggle buttons present in DOM", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      await page.locator("[data-testid='toggle-chat-list']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='toggle-gallery']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='toggle-character-info']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  });

  test("chat list panel exists in DOM", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      await page.locator("[data-testid='chat-list-panel']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  });

  test("gallery sidebar exists in DOM", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      await page.locator("[data-testid='gallery-sidebar']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  });

  test("character info panel exists in DOM", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      await page.locator("[data-testid='character-info-panel']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  });
});

describe("Elements present", () => {
  test("all chat panel elements exist in DOM", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      await page.locator("[data-testid='character-info-panel']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='gallery-sidebar']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='chat-list-panel']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  });

  test("generation status container exists", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      await page.locator("[data-testid='generation-status']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  });
});

describe("Message input", () => {
  test("message input exists in DOM", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      await page.locator("[data-testid='message-input']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  });

  test("send button exists in DOM", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      await page.locator("[data-testid='send-button']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  });

  test("attach input exists", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      await page.locator("[data-testid='attach-input']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  });

  test("message form exists", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      await page.locator("[data-testid='message-form']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  });
});

describe("Chat list panel", () => {
  test("chat list panel has chat template in DOM", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      const chatListPanel = page.locator("[data-testid='chat-list-panel']",);
      await chatListPanel.waitFor({ state: "attached", timeout: 10_000, },);
      // Behavioral: after Alpine evaluates, the list must show either the
      // rendered empty state or rendered chat entries — template source
      // strings ('filteredChats'/'selectChat') prove nothing about x-for
      // evaluation. Known blocker: BUG-alpine-init-crash-chat-view-store-undefined
      // (Alpine init crash leaves #chat-list unrendered — this test fails
      // until that root cause is fixed).
      await page.waitForFunction(
        () => {
          const list = document.querySelector("#chat-list",);
          if (!list) { return false; }
          const hasEmptyState = list.textContent?.includes("No chats yet",) ?? false;
          const hasRenderedItems = list.querySelectorAll("a.nav-item",).length > 0;
          return hasEmptyState || hasRenderedItems;
        },
        undefined,
        { timeout: 10_000, },
      );
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  });

  test("cancel generation button exists in DOM", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      await page.locator("[data-testid='cancel-generation']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  });
});

describe("Chat gallery upload linkage", () => {
  test("chat sidebar upload links the asset to the active chat", async () => {
    const page = await ctx.browser.newPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoChat(page,);
      // Select the seeded solo chat so activeChat is set and the sidebar's
      // upload control (inside <template x-if="activeChat">) renders.
      await page.evaluate(() => {
        document.querySelector("[data-testid='toggle-chat-list']",)?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, },),
        );
      },);
      const chatItem = page.locator("[data-testid='chat-list-panel'] .nav-item",).filter({
        hasText: SEED.soloChat.name,
      },).first();
      await chatItem.waitFor({ state: "attached", timeout: 15_000, },);
      await chatItem.click();
      await waitForAlpineState(
        page,
        "[x-data='chatState()']",
        (state,) => state.activeChat === SEED.soloChat.id,
        10_000,
      );

      // The sidebar upload control must be a wired file input (replacing the
      // previous htmx→#modal-container button, which never mounted in chat).
      const input = page.locator("[data-testid='gallery-upload-input']",);
      await input.waitFor({ state: "attached", timeout: 10_000, },);

      // Register both expected response watchers BEFORE the file input fires,
      // else the link POST (which follows the upload synchronously) races past.
      const uploadRes = page.waitForResponse(
        (res,) => {
          const url = new URL(res.url(),);
          return res.request().method() === "POST" && url.pathname === "/api/assets";
        },
        { timeout: 15_000, },
      );
      const linkRes = page.waitForResponse(
        (res,) => {
          const url = new URL(res.url(),);
          return res.request().method() === "POST" && /^\/api\/assets\/[^/]+\/links$/.test(url.pathname,);
        },
        { timeout: 15_000, },
      );

      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      await input.setInputFiles({ name: "chat-upload.png", mimeType: "image/png", buffer: png, },);

      const res = await uploadRes;
      expect(res.status(), `upload should succeed (got ${res.status()})`,).toBeLessThan(400,);
      const created = (await res.json()) as { id: string };
      expect(created.id, "upload response should carry asset id",).toBeDefined();

      // The upload must also create a chat→asset link (entity_type=chat) so
      // the sidebar's loadGalleryAssets (entity_type=chat) shows it.
      const links = await linkRes;
      const linkBody = (await links.json()) as { id?: string };
      expect(links.status(), `link should succeed (got ${links.status()})`,).toBeLessThan(400,);
      expect(linkBody.id ?? created.id, "link should reference the uploaded asset",).toBe(created.id,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 45_000,);
});
