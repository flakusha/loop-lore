/**
 * Browser E2E: Chat Flow
 *
 * Tests chat interactions via browser: toggle panels, message input.
 * Each test creates its own page for isolation.
 * Pre-logs in to access seeded data.
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
  await page.locator("[data-testid='message-list']").waitFor({ state: 'attached', timeout: 8000 });
}

describe("Toggle buttons", () => {
  test("toggle buttons are present", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='toggle-chat-list']").waitFor({ state: 'attached', timeout: 5000 });
    await page.locator("[data-testid='toggle-gallery']").waitFor({ state: 'attached', timeout: 5000 });
    await page.locator("[data-testid='toggle-character-info']").waitFor({ state: 'attached', timeout: 5000 });
    expect(await page.locator("[data-testid='toggle-chat-list']").isVisible()).toBe(true);
    expect(await page.locator("[data-testid='toggle-gallery']").isVisible()).toBe(true);
    expect(await page.locator("[data-testid='toggle-character-info']").isVisible()).toBe(true);
    await page.close();
  });
});

describe("Elements present", () => {
  test("characters info panel element exists in DOM", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='character-info-panel']").waitFor({ state: 'attached', timeout: 5000 });
    await page.close();
  });

  test("gallery sidebar element exists in DOM", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='gallery-sidebar']").waitFor({ state: 'attached', timeout: 5000 });
    await page.close();
  });
});

describe("Message input", () => {
  test("input disabled when no active chat", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='message-input']").waitFor({ state: 'attached', timeout: 5000 });
    const disabled = await page.getAttribute("[data-testid='message-input']", "disabled");
    expect(disabled).not.toBeNull();
    await page.close();
  });

  test("send button rendered", async () => {
    const page = await ctx.browser.newPage();
    await gotoChat(page);
    await page.locator("[data-testid='send-button']").waitFor({ state: 'attached', timeout: 5000 });
    expect(await page.locator("[data-testid='send-button']").isVisible()).toBe(true);
    await page.close();
  });
});
