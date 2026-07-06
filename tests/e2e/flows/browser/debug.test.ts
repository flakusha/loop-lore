import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createBrowserTest, type BrowserTestContext } from "../../helpers/browser-server";

describe("Nav debug", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 45_000);

  afterAll(async () => {
    await ctx.close();
  });

  test("step through navs", async () => {
    const page = await ctx.browser.newPage();

    // Step 1: goto chat
    await page.goto(ctx.url + "/views/chat", { waitUntil: "networkidle", timeout: 10_000 });
    await page.waitForTimeout(500);
    let headerCount = await page.locator("#header-slot").count();
    console.log("After goto chat:", { headerCount });

    // Step 2: nav to characters
    await page.click("[data-testid='nav-characters']");
    await page.locator("[data-testid='characters-header']").waitFor({ state: "attached", timeout: 8000 });
    await page.waitForTimeout(300);
    headerCount = await page.locator("#header-slot").count();
    const headerParents = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("#header-slot")).map(h => ({
        tag: h.tagName,
        parentTag: h.parentElement?.tagName || "none",
        parentId: h.parentElement?.id || "none",
        testid: h.getAttribute("data-testid") || "none",
        children: h.children.length,
        text: (h.textContent || "").trim().slice(0, 40),
      }));
    });
    console.log("After nav to characters:", { headerCount, headers: JSON.stringify(headerParents) });

    // Step 3: nav to worlds
    await page.click("[data-testid='nav-worlds']");
    await page.locator("[data-testid='worlds-header']").waitFor({ state: "attached", timeout: 8000 });
    await page.waitForTimeout(300);
    headerCount = await page.locator("#header-slot").count();
    const headerParents2 = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("#header-slot")).map(h => ({
        tag: h.tagName,
        parentTag: h.parentElement?.tagName || "none",
        parentId: h.parentElement?.id || "none",
        testid: h.getAttribute("data-testid") || "none",
        children: h.children.length,
        text: (h.textContent || "").trim().slice(0, 40),
      }));
    });
    console.log("After nav to worlds:", { headerCount, headers: JSON.stringify(headerParents2) });

    // Step 4: nav to gallery
    await page.click("[data-testid='nav-gallery']");
    await page.locator("[data-testid='gallery-header']").waitFor({ state: "attached", timeout: 8000 });
    await page.waitForTimeout(300);
    headerCount = await page.locator("#header-slot").count();
    const headerParents3 = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("#header-slot")).map(h => ({
        tag: h.tagName,
        parentTag: h.parentElement?.tagName || "none",
        parentId: h.parentElement?.id || "none",
        testid: h.getAttribute("data-testid") || "none",
        children: h.children.length,
        text: (h.textContent || "").trim().slice(0, 40),
      }));
    });
    console.log("After nav to gallery:", { headerCount, headers: JSON.stringify(headerParents3) });

    await page.close();
  });
});
