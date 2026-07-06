/**
 * Browser E2E: Chat Flow
 *
 * Tests chat interactions via browser: toggle panels, message input, chat creation.
 * Pre-logs in via seeded data (demo/solo mode).
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createBrowserTest, type BrowserTestContext } from "../../helpers/browser-server";
import { seedAll, SEED } from "../../helpers/seed";

let ctx: BrowserTestContext;

beforeAll(async () => {
  ctx = await createBrowserTest();
  await seedAll(ctx.db);
}, 45_000);

afterAll(async () => {
  await ctx.close();
});

async function gotoChat(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>) {
  await page.goto(ctx.url + "/views/chat", { waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
  await page.locator("[data-testid='message-list']").waitFor({ state: "attached", timeout: 8000 });
}

describe("Toggle buttons", () => {
  test("toggle buttons present and visible", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='toggle-chat-list']").waitFor({ state: "attached", timeout: 5000 });
    await page.locator("[data-testid='toggle-gallery']").waitFor({ state: "attached", timeout: 5000 });
    await page.locator("[data-testid='toggle-character-info']").waitFor({ state: "attached", timeout: 5000 });
    expect(await page.locator("[data-testid='toggle-chat-list']").isVisible()).toBe(true);
    expect(await page.locator("[data-testid='toggle-gallery']").isVisible()).toBe(true);
    expect(await page.locator("[data-testid='toggle-character-info']").isVisible()).toBe(true);
    await page.close();
  });

  test("chat list panel toggles on button click", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    const panel = page.locator("[data-testid='chat-list-panel']");
    await panel.waitFor({ state: "attached", timeout: 5000 });
    // Should be hidden initially (x-show false)
    let visible = await panel.isVisible();
    expect(visible).toBe(false);
    // Click toggle to show
    await page.click("[data-testid='toggle-chat-list']");
    await page.waitForTimeout(400); // x-transition
    visible = await panel.isVisible();
    expect(visible).toBe(true);
    await page.close();
  });

  test("gallery sidebar toggles on button click", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    const sidebar = page.locator("[data-testid='gallery-sidebar']");
    await sidebar.waitFor({ state: "attached", timeout: 5000 });
    let visible = await sidebar.isVisible();
    expect(visible).toBe(false);
    await page.click("[data-testid='toggle-gallery']");
    await page.waitForTimeout(400);
    visible = await sidebar.isVisible();
    expect(visible).toBe(true);
    await page.close();
  });

  test("character info panel toggles on button click", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    const panel = page.locator("[data-testid='character-info-panel']");
    await panel.waitFor({ state: "attached", timeout: 5000 });
    let visible = await panel.isVisible();
    expect(visible).toBe(false);
    await page.click("[data-testid='toggle-character-info']");
    await page.waitForTimeout(400);
    visible = await panel.isVisible();
    expect(visible).toBe(true);
    await page.close();
  });
});

describe("Elements present", () => {
  test("all chat panel elements exist in DOM", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='character-info-panel']").waitFor({ state: "attached", timeout: 5000 });
    await page.locator("[data-testid='gallery-sidebar']").waitFor({ state: "attached", timeout: 5000 });
    await page.locator("[data-testid='chat-list-panel']").waitFor({ state: "attached", timeout: 5000 });
    await page.close();
  });

  test("generation status container exists", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='generation-status']").waitFor({ state: "attached", timeout: 5000 });
    await page.close();
  });
});

describe("Message input", () => {
  test("input disabled when no active chat", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='message-input']").waitFor({ state: "attached", timeout: 5000 });
    const disabled = await page.getAttribute("[data-testid='message-input']", "disabled");
    expect(disabled).not.toBeNull();
    await page.close();
  });

  test("send button present and disabled when no active chat", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='send-button']").waitFor({ state: "attached", timeout: 5000 });
    const disabled = await page.getAttribute("[data-testid='send-button']", "disabled");
    expect(disabled).not.toBeNull();
    await page.close();
  });

  test("attach input exists", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='attach-input']").waitFor({ state: "attached", timeout: 5000 });
    await page.close();
  });

  test("message form exists", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='message-form']").waitFor({ state: "attached", timeout: 5000 });
    await page.close();
  });
});

describe("Chat list panel", () => {
  test("chat list panel shows seeded chats when toggled", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    // Open chat list panel
    await page.click("[data-testid='toggle-chat-list']");
    await page.waitForTimeout(400);
    // Chat list should include our seeded chat
    const chatItems = page.locator("[data-testid='chat-list-panel'] .nav-item");
    const count = await chatItems.count();
    expect(count).toBeGreaterThan(0);
    // Should show the seeded chat name
    const firstText = await chatItems.first().textContent();
    expect(firstText).toContain(SEED.chat.name);
    await page.close();
  });

  test("clicking a chat in list selects it", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.click("[data-testid='toggle-chat-list']");
    await page.waitForTimeout(400);
    // Click the first chat item
    const chatItem = page.locator("[data-testid='chat-list-panel'] .nav-item").first();
    await chatItem.waitFor({ state: "attached", timeout: 5000 });
    await chatItem.click();
    // After selection, message input should be enabled
    await page.waitForTimeout(500);
    const disabled = await page.getAttribute("[data-testid='message-input']", "disabled");
    expect(disabled).toBeNull();
    // Messages should load (either messages or empty state)
    const messages = page.locator("[data-testid='message-list']");
    await messages.waitFor({ state: "attached", timeout: 5000 });
    await page.close();
  });

  test("cancel generation button is conditionally visible", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='cancel-generation']").waitFor({ state: "attached", timeout: 5000 });
    // Should be hidden when not generating
    expect(await page.locator("[data-testid='cancel-generation']").isVisible()).toBe(false);
    await page.close();
  });
});
