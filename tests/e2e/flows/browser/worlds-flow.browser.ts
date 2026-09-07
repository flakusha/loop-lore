// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { mkdirSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { createClient, } from "../../helpers/client";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { seedAll, } from "../../helpers/seed";

describe("Worlds flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await seedAll(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoWorlds(
    page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
  ) {
    try {
      await page.goto(`${ctx.url}/views/worlds`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    } catch {}
    await page.locator("[data-testid='app-root']",).waitFor({ state: "attached", timeout: 15_000, },);
  }

  async function createWorldViaApi(name: string,): Promise<string> {
    const client = createClient(ctx.url,);
    const res = await client.post<{ id: string }>("/api/worlds", { name, description: `E2E: ${name}`, },);
    return res.data!.id;
  }

  describe("Page load", () => {
    test("worlds page loads with header", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoWorlds(page,);
        await page.locator("[data-testid='worlds-header']",).waitFor({ state: "attached", timeout: 10_000, },);
        const title = await page.locator("[data-testid='worlds-header'] .title",).textContent();
        expect(title,).toBe("Worlds",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("create and import buttons exist", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoWorlds(page,);
        await page.locator("[data-testid='create-world']",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.locator("[data-testid='import-world']",).waitFor({ state: "visible", timeout: 10_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  describe("Create world", () => {
    test("create world modal opens", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoWorlds(page,);
        await page.locator("[data-testid='create-world']",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.click("[data-testid='create-world']",);
        await page.locator("[data-testid='create-world-modal']",).waitFor({ state: "visible", timeout: 10_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("create world form has required fields", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoWorlds(page,);
        await page.click("[data-testid='create-world']",);
        await page.locator("[data-testid='create-world-modal']",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.locator("[data-testid='create-world-form'] #world-name",).waitFor({
          state: "attached",
          timeout: 10_000,
        },);
        await page.locator("[data-testid='create-world-form'] button[type='submit']",).waitFor({
          state: "attached",
          timeout: 10_000,
        },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  describe("World list and navigation", () => {
    test("world list renders seeded worlds", async () => {
      await createWorldViaApi("API Created World",);
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoWorlds(page,);
        await page.locator("[data-testid='world-list'] .world-name",).first().waitFor({
          state: "attached",
          timeout: 30_000,
        },);
        const worldNames = await page.locator("[data-testid='world-list'] .world-name",).allTextContents();
        expect(worldNames.some((n: string,) => n.includes("API Created World",)),).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("clicking a world card navigates to detail page", async () => {
      await createWorldViaApi("Detail Test World",);
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoWorlds(page,);
        const firstCard = page.locator("[data-testid^='world-card-']",).first();
        await firstCard.waitFor({ state: "visible", timeout: 30_000, },);
        await firstCard.click();
        await page.locator("[data-testid='world-detail-header']",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(page.url(),).toContain("/worlds/",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 90_000,);
  });

  describe("Sidebar navigation", () => {
    test("sidebar navigation works from worlds page", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoWorlds(page,);
        await page.locator("[data-testid='nav-characters']",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.evaluate(() => {
          (document.querySelector("[data-testid='nav-characters']",) as HTMLElement)?.click();
        },);
        await page.locator("[data-testid='characters-header']",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(page.url(),).toContain("/views/characters",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });
  });

  describe("World import/export menus", () => {
    test("world import opens import modal", async () => {
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoWorlds(page,);
        await page.locator("[data-testid='import-world']",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.click("[data-testid='import-world']",);
        await page.locator("[data-testid='import-world-modal']",).waitFor({ state: "visible", timeout: 10_000, },);
        await page.locator("[data-testid='import-world-form'] #world-import-file-input",).waitFor({
          state: "attached",
          timeout: 10_000,
        },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    });

    test("exported world bundle imports via the modal and creates a new world", async () => {
      // Create a source world, export it to a temp .world.json, then import
      // that file through the import modal and assert a new world appears.
      const sourceId = await createWorldViaApi("Source Export World",);

      const client = createClient(ctx.url,);
      const dlRes = await fetch(`${ctx.url}/api/worlds/${sourceId}/export`, {
        headers: { Cookie: `ll_token=${client.token ?? ""}`, },
      },);
      expect(dlRes.status,).toBe(200,);
      expect(dlRes.headers.get("content-disposition",),).toContain("attachment",);
      const bundle = await dlRes.text();

      const tmpDir = join(tmpdir(), `loop-lore-e2e-import`,);
      mkdirSync(tmpDir, { recursive: true, },);
      const tmpPath = join(tmpDir, `source-${sourceId}.world.json`,);
      writeFileSync(tmpPath, bundle,);

      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoWorlds(page,);
        await page.click("[data-testid='import-world']",);

        const input = page.locator("[data-testid='import-world-form'] #world-import-file-input",);
        await input.setInputFiles(tmpPath,);

        // Submit the form → importWorld() reads the file, POSTs the bundle,
        // then refreshes #world-list via htmx.
        await page.locator("[data-testid='import-world-form'] button[type='submit']",).click();
        await page.locator("[data-testid='world-list'] .world-name",).first().waitFor({
          state: "attached",
          timeout: 30_000,
        },);
        const names = await page.locator("[data-testid='world-list'] .world-name",).allTextContents();
        expect(names.some((n: string,) => n.includes("Source Export World",)),).toBe(true,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 90_000,);

    test("world detail export button triggers exportWorld download handler", async () => {
      const worldId = await createWorldViaApi("Detail Export World",);
      const page = await ctx.browser.newPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoWorlds(page,);
        // Navigate straight to the created world's detail page (avoid depending
        // on list ordering across tests sharing the DB).
        await page.goto(`${ctx.url}/worlds/${worldId}`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
        await page.locator("[data-testid='world-detail-header']",).waitFor({ state: "attached", timeout: 15_000, },);
        expect(page.url(),).toMatch(new RegExp(`/worlds/${worldId}`,),);

        const exportBtn = page.locator("[data-testid='export-world']",);
        await exportBtn.waitFor({ state: "visible", timeout: 10_000, },);

        // exportWorld() does location.assign(GET /api/worlds/:id/export). With
        // Content-Disposition: attachment the browser fires a download carrying
        // the world's .world.json bundle. Asserting the REAL world id + name
        // (not a placeholder) proves the substitution fix.
        const [download,] = await Promise.all([
          page.waitForEvent("download", { timeout: 15_000, },),
          exportBtn.click(),
        ],);
        expect(download.suggestedFilename(),).toMatch(/\.world\.json$/i,);
        const stream = await download.createReadStream();
        expect(stream,).not.toBeNull();
        const body = await new Promise<string>((resolve, reject,) => {
          let data = "";
          stream?.on("data", (chunk: Buffer,) => {
            data += chunk.toString();
          },);
          stream?.on("end", () => resolve(data,),);
          stream?.on("error", reject,);
        },);
        const parsed = JSON.parse(body,) as { schema_version: string; world: { id: string; name: string } };
        expect(parsed.schema_version,).toBe("1.0",);
        expect(parsed.world.id,).toBe(worldId,);
        expect(parsed.world.name,).toBe("Detail Export World",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 90_000,);
  });
});
