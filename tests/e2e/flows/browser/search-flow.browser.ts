/**
 * Browser E2E: Search & Filtering
 *
 * Verifies the gallery filter-bar search narrows the grid via the
 * /dynamic/gallery/search endpoint. Two seeded assets with distinct filenames;
 * searching for one must show only its card.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

describe("Search & filtering E2E", () => {
  let ctx: BrowserTestContext;
  const assetA = `a1000001-0000-4000-a000-000000000000`;
  const assetB = `a1000002-0000-4000-a000-000000000000`;
  const fileNameA = "bright-orange-book.png";
  const fileNameB = "mossy-stone-wall.png";

  beforeAll(async () => {
    ctx = await createBrowserTest();
    for (const [id, name,] of [[assetA, fileNameA,], [assetB, fileNameB,],] as const) {
      await ctx.db
        .insertInto("assets",)
        .values({
          id,
          owner_id: SEED.solo.id,
          filename: name,
          mime_type: "image/png",
          asset_type: "image",
          size_bytes: 10,
          storage_path: `/tmp/test-${id}.png`,
          storage_backend: "local",
        },)
        .onConflict((oc,) => oc.column("id",).doNothing())
        .execute();
    }
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoGallery(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.goto(`${ctx.url}/views/gallery`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='gallery-header']",).waitFor({ state: "attached", timeout: 30_000, },);
  }

  describe("Gallery search", () => {
    test("filtering by filename narrows the grid to matching assets", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, {
        // Seed assets reference synthetic storage files that don't exist, so
        // their /api/assets/:id/thumb requests 404. This is test-data noise,
        // not an app regression.
        allowlist: [/\bFailed to load resource: the server responded with a status of 404 \(Not Found\)/,],
      },);
      try {
        await gotoGallery(page,);

        // Wait for grid to load both seeded assets.
        await page.locator(`[data-testid='asset-card-${assetA}']`,).waitFor({ timeout: 30_000, },);
        await page.locator(`[data-testid='asset-card-${assetB}']`,).waitFor({ timeout: 30_000, },);

        // Type a query matching only asset A; filter-bar debounces + searches.
        await page.fill(".list-search", "bright-orange",);
        await page.waitForTimeout(700,);

        // asset A card remains; asset B card is gone from the grid.
        await page.locator(`[data-testid='asset-card-${assetA}']`,).waitFor({ timeout: 30_000, },);
        const bCount = await page.locator(`[data-testid='asset-card-${assetB}']`,).count();
        expect(bCount,).toBe(0,);

        // Clearing the query restores both.
        await page.fill(".list-search", "",);
        await page.waitForTimeout(700,);
        await page.locator(`[data-testid='asset-card-${assetB}']`,).waitFor({ timeout: 30_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);
  });
});
