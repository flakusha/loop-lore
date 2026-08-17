// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Gallery Flow
 *
 * Verifies the gallery upload flow through the UI: open upload modal, pick a
 * file, submit, and assert the asset persists to the DB and renders in the
 * grid (the existing suites only assert the modal lazy-loads).
 *
 * Also verifies the C6 signed-URL download flow: the preview download button
 * must request a signed URL (POST /api/assets/:id/signed-url/:action) and
 * then fetch the media through that signed URL (sig+expires) rather than the
 * raw authenticated endpoint.
 */

import { type Download, } from "@playwright/test";
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

  /** Upload a 1x1 PNG via the gallery modal; returns the created asset id. */
  async function uploadImage(
    page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
    filename: string,
  ): Promise<string> {
    // Assert the upload POST succeeds at the HTTP layer (not just the DB row)
    // so failures surface their real status instead of a silent DB timeout.
    const uploadRes = page.waitForResponse((res,) => {
      const url = new URL(res.url(),);
      return res.request().method() === "POST" && url.pathname === "/api/assets";
    }, { timeout: 15_000, },);
    await page.click("[data-testid='upload-button']",);
    await page.locator("[data-testid='upload-form']",).waitFor({ state: "visible", timeout: 15_000, },);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await page.setInputFiles("#upload-file-input", {
      name: filename,
      mimeType: "image/png",
      buffer: png,
    },);
    await page.fill("#asset-label", "browser-upload",);
    await page.click("[data-testid='upload-form'] button[type='submit']",);

    const res = await uploadRes;
    expect(res.status(), `upload should succeed (got ${res.status()})`,).toBeLessThan(400,);

    // The upload response carries the created asset id. Prefer it over the
    // DB poll so we never depend on filename matching.
    const created = (await res.json()) as { id: string };
    expect(created.id, "upload response should carry asset id",).toBeDefined();

    // Grid reload can race the DB commit — confirm the row is durable.
    const deadline = Date.now() + 10_000;
    let durable = false;
    while (Date.now() < deadline) {
      const row = await ctx.db
        .selectFrom("assets",)
        .select("id",)
        .where("id", "=", created.id,)
        .executeTakeFirst();
      if (row) {
        durable = true;
        break;
      }
      await new Promise((resolve,) => setTimeout(resolve, 250,));
    }
    expect(durable, "uploaded asset row should be durable",).toBe(true,);
    return created.id;
  }

  describe("Upload flow", () => {
    test("uploads an image that persists to the DB and renders in the grid", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      try {
        await gotoGallery(page,);
        await page.locator("[data-testid='upload-button']",).waitFor({ state: "visible", timeout: 15_000, },);
        const id = await uploadImage(page, "browser-test.png",);

        // The grid reload can race the DB commit — wait for the asset card.
        await page.reload({ waitUntil: "domcontentloaded", },);
        await page.locator(`[data-testid='asset-card-${id}']`,).waitFor({ timeout: 30_000, },);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);
  });

  describe("Signed-URL download flow", () => {
    test("preview downloads via a signed URL instead of the raw endpoint", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page,);
      const requests: string[] = [];
      page.on("request", (req,) => {
        requests.push(req.url(),);
      },);
      try {
        await gotoGallery(page,);
        await page.locator("[data-testid='upload-button']",).waitFor({ state: "visible", timeout: 15_000, },);
        const id = await uploadImage(page, "signed-download.png",);

        await page.reload({ waitUntil: "domcontentloaded", },);
        await page.locator(`[data-testid='asset-card-${id}']`,).waitFor({ timeout: 30_000, },);

        // Open the preview modal, then trigger the Download button.
        await page.locator(`[data-testid='asset-card-${id}']`,).click();
        await page.locator("[data-testid='preview-modal']",).waitFor({ state: "visible", timeout: 15_000, },);
        await page.locator("[data-testid='preview-modal']",).getByRole("button", { name: "Download", },).click();

        // The download must first POST for a signed URL, then fetch the media
        // through the signed download endpoint (carrying sig+expires) — never
        // a bare authenticated /download hit.
        expect(
          requests.some((u,) => u.includes(`/api/assets/${id}/signed-url/download`,)),
          "download should request a signed URL",
        ).toBe(true,);

        // The anchor fires the file download (Content-Disposition: attachment),
        // which Playwright surfaces via the `download` event rather than a
        // response we can wait on. Assert the download URL is the signed
        // endpoint carrying sig+expires.
        let download: Download | null = null;
        try {
          download = await page.waitForEvent("download", { timeout: 15_000, },);
        } catch {
          download = null;
        }
        expect(download, "download should be initiated",).not.toBeNull();
        if (download) {
          const dlUrl = new URL(download.url(),);
          expect(dlUrl.pathname, "download should target the download endpoint",).toBe(`/api/assets/${id}/download`,);
          expect(dlUrl.searchParams.has("sig",), "download should carry sig",).toBe(true,);
          expect(dlUrl.searchParams.has("expires",), "download should carry expires",).toBe(true,);
        }

        // Assert the bare authenticated endpoint was never hit.
        const bareGet = requests.some((u,) => {
          const url = new URL(u,);
          return url.pathname === `/api/assets/${id}/download` && !url.searchParams.has("sig",);
        },);
        expect(bareGet, "download should never hit the bare authenticated endpoint",).toBe(false,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);
  });
});
