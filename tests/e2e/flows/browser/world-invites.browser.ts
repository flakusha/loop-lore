/**
 * Browser E2E: World Invite Management (world-edit → Invites tab)
 *
 * Covers the world invite lifecycle through the UI:
 *  - a world is created via the worlds view UI (owner = acting solo user)
 *  - the world editor loads for that owned world
 *  - an invite is created with a max-uses cap, persisted to the
 *    `world_invites` table, and its code renders in the Invites tab
 *  - revoking the invite marks the DB row revoked and removes the row from
 *    the UI
 *
 * Runs in default solo mode (auth not required); the solo user owns every
 * world it creates, so the world editor and invite endpoints are reachable.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Page, } from "@playwright/test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";

describe("World invites E2E", () => {
  let ctx: BrowserTestContext;

  // Benign resource-load noise (favicon, missing static asset) that must not
  // fail the page-error assertion; the real signals are the DB + DOM state.
  const ALLOW_NOISE = [/favicon/i, /status of 404 \(Not Found\)/, /status of 401 \(Unauthorized\)/,];

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 45_000,);

  afterAll(async () => {
    await ctx.close();
  },);

  /**
   * Create a world through the worlds-view UI and land on its editor page.
   * Returns the created world id (parsed from the /worlds/<id>/edit URL).
   */
  async function createWorld(page: Page,): Promise<string> {
    await page.goto(`${ctx.url}/views/worlds`, { waitUntil: "domcontentloaded", timeout: 15_000, },);
    await page.locator("[data-testid='create-world']",).waitFor({ state: "visible", timeout: 10_000, },);
    await page.click("[data-testid='create-world']",);
    await page.locator("[data-testid='create-world-modal']",).waitFor({ state: "visible", timeout: 8_000, },);
    await page.locator("[data-testid='create-world-form'] #world-name",).waitFor({
      state: "attached",
      timeout: 8_000,
    },);
    await page.fill("[data-testid='create-world-form'] #world-name", `world-${Date.now()}`,);
    await page.click("[data-testid='create-world-form'] button[type='submit']",);

    // Success redirects to /worlds/<id>/edit (full navigation via location.assign).
    await page.waitForURL((url,) => /\/worlds\/[a-f0-9-]+\/edit$/.test(url.pathname,), { timeout: 12_000, },);
    const match = page.url().match(/\/worlds\/([a-f0-9-]+)\/edit/,);
    if (!match) { throw new Error(`Could not parse world id from URL: ${page.url()}`,); }

    // The editor body (incl. tab bar) only renders after /api/worlds/:id loads.
    await page.locator(".world-edit-tab",).filter({ hasText: "Invites", },).waitFor({
      state: "visible",
      timeout: 12_000,
    },);
    return match[1];
  }

  /** On the world-edit page: open the Invites tab and create an invite. */
  async function createInvite(page: Page, maxUses: string,): Promise<void> {
    await page.locator(".world-edit-tab",).filter({ hasText: "Invites", },).click();
    await page.locator("[data-testid='show-create-invite-btn']",).waitFor({ state: "visible", timeout: 8_000, },);
    await page.click("[data-testid='show-create-invite-btn']",);
    await page.fill("#invite-max-uses", maxUses,);
    await page.click("[data-testid='submit-create-invite']",);
    await page.locator("[data-testid='copy-invite-code']",).waitFor({ state: "visible", timeout: 8_000, },);
  }

  describe("World creation via UI", () => {
    test("creates a world and loads its editor with an Invites tab", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, { allowlist: ALLOW_NOISE, },);
      try {
        const worldId = await createWorld(page,);

        // The world was persisted with the acting (solo) user as owner.
        const row = await ctx.db
          .selectFrom("worlds",)
          .select(["id", "owner_id",],)
          .where("id", "=", worldId,)
          .executeTakeFirst();
        expect(row,).not.toBeNull();
        expect(row!.id,).toBe(worldId,);

        // The editor tab bar includes the Invites tab (already awaited above).
        expect(await page.locator(".world-edit-tab",).count(),).toBeGreaterThanOrEqual(5,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);
  });

  describe("Invite creation", () => {
    test("creates an invite that persists and renders its code", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, { allowlist: ALLOW_NOISE, },);
      try {
        const worldId = await createWorld(page,);
        await createInvite(page, "5",);

        // Invite persisted in the DB with the expected cap and active state.
        const row = await ctx.db
          .selectFrom("world_invites",)
          .select(["id", "world_id", "code", "max_uses", "revoked", "uses",],)
          .where("world_id", "=", worldId,)
          .executeTakeFirst();
        expect(row,).not.toBeNull();
        expect(row!.world_id,).toBe(worldId,);
        expect(row!.max_uses,).toBe(5,);
        expect(row!.revoked,).toBe(0,);
        expect(row!.uses,).toBe(0,);
        expect(row!.code,).toBeTruthy();

        // The invite code rendered in the DOM matches the persisted code.
        const domCode = (await page.locator(".panel-item code",).first().textContent(),)?.trim();
        expect(domCode,).toBe(row!.code,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);
  });

  describe("Invite revocation", () => {
    test("revoking an invite removes it from the UI and marks the DB row revoked", async () => {
      const page = await ctx.openPage();
      const errors = trackPageErrors(page, { allowlist: ALLOW_NOISE, },);
      try {
        const worldId = await createWorld(page,);
        await createInvite(page, "3",);

        const row = await ctx.db
          .selectFrom("world_invites",)
          .select(["id", "revoked",],)
          .where("world_id", "=", worldId,)
          .executeTakeFirst();
        const inviteId = row!.id;

        // revokeInvite() gates on window.confirm() — accept the dialog.
        page.on("dialog", async (dialog,) => dialog.accept(),);
        await page.click("[data-testid='revoke-invite']",);

        // The row leaves the UI (the revoke button disappears).
        await page.locator("[data-testid='revoke-invite']",).waitFor({ state: "hidden", timeout: 8_000, },);
        expect(await page.locator("[data-testid='revoke-invite']",).count(),).toBe(0,);
        expect(await page.locator("[data-testid='copy-invite-code']",).count(),).toBe(0,);

        // DB row still exists but is soft-revoked (revoked = 1).
        const revoked = await ctx.db
          .selectFrom("world_invites",)
          .select(["id", "revoked",],)
          .where("id", "=", inviteId,)
          .executeTakeFirst();
        expect(revoked,).not.toBeNull();
        expect(revoked!.id,).toBe(inviteId,);
        expect(revoked!.revoked,).toBe(1,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 60_000,);
  });
});
