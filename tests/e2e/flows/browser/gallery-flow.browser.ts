/**
 * Browser E2E: Gallery Flow
 *
 * Verifies the gallery upload flow through the UI: open upload modal, pick a
 * file, submit, and assert the asset persists to the DB and renders in the
 * grid (the existing suites only assert the modal lazy-loads).
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";

describe("Gallery flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoGallery(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.goto(`${ctx.url}/views/gallery`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='gallery-header']",).waitFor({ state: "attached", timeout: 30_000, },);
  }

  describe("Upload flow", () => {
    test("uploads an image that persists to the DB and renders in the grid", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoGallery(page,);
        await page.locator("[data-testid='upload-button']",).waitFor({ state: "visible", timeout: 15_000, },);
        await page.click("[data-testid='upload-button']",);
        await page.locator("[data-testid='upload-form']",).waitFor({ state: "visible", timeout: 15_000, },);

        // 1x1 PNG.
        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64",
        );
        await page.setInputFiles("#upload-file-input", {
          name: "browser-test.png",
          mimeType: "image/png",
          buffer: png,
        },);
        await page.fill("#asset-label", "browser-upload",);
        await page.click("[data-testid='upload-form'] button[type='submit']",);

        // Upload is async (multipart POST → htmx swap). Poll the DB until the
        // asset row appears (bounded) instead of a single immediate query.
        let row: { id: string; filename: string } | undefined;
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          row = await ctx.db
            .selectFrom("assets",)
            .select(["id", "filename",],)
            .where("filename", "=", "browser-test.png",)
            .executeTakeFirst();
          if (row) { break; }
          await new Promise((resolve,) => setTimeout(resolve, 250,));
        }
        expect(row,).not.toBeNull();
        expect(row!.filename,).toBe("browser-test.png",);

        // The grid reload can race the DB commit — wait for the asset card.
        await page.reload({ waitUntil: "domcontentloaded", },);
        await page.locator(`[data-testid='asset-card-${row!.id}']`,).waitFor({ timeout: 30_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);
  });
});
