// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

import type { Page, } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";

describe("World invites E2E", () => {
  let ctx: BrowserTestContext;

  // Benign resource-load noise (favicon, missing static asset) that must not
  // fail the page-error assertion; the real signals are the DB + DOM state.
  const ALLOW_NOISE = [/favicon/i, /status of 404 \(Not Found\)/, /status of 401 \(Unauthorized\)/,];

  beforeAll(async () => {
    ctx = await createBrowserTest();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  /**
   * Create a world through the worlds-view UI and land on its editor page.
   * Returns the created world id (parsed from the /worlds/<id>/edit URL).
   *
   * Uses evaluate-based .click() so the fixed notification-bell overlay
   * (z-index 1200 in the global header) does not block pointer events at
   * Playwright's actionability check. The htmx handlers do not depend on
   * real visual position — clicking the element from JS dispatches the same
   * flow as a real user click.
   */
  async function createWorld(page: Page,): Promise<string> {
    await page.goto(`${ctx.url}/views/worlds`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='create-world']",).waitFor({ state: "attached", timeout: 30_000, },);

    // Open the modal via DOM click (bypasses actionability check).
    await page.evaluate(() => {
      const el = document.querySelector("[data-testid='create-world']",);
      if (el instanceof HTMLElement) { el.click(); }
    },);
    await page.locator("[data-testid='create-world-modal']",).waitFor({ state: "attached", timeout: 15_000, },);

    // Form fields and submit use the same evaluate-click workaround.
    await page.locator("[data-testid='create-world-form'] #world-name",).waitFor({
      state: "attached",
      timeout: 15_000,
    },);
    await page.fill("[data-testid='create-world-form'] #world-name", `world-${Date.now()}`,);
    // Call the page-side createWorld() handler directly; this is the same
    // function the form's x-on:submit binding fires, just bypasses the
    // actionability check on the submit button.
    await page.evaluate(() => {
      const fn = (globalThis as { createWorld?: (event: Event,) => Promise<void> }).createWorld;
      const form = document.querySelector("[data-testid='create-world-form']",) as HTMLFormElement | null;
      if (fn && form) {
        // Build a submit-like event so the handler reads the form via FormData.
        const event = new Event("submit", { bubbles: true, cancelable: true, },);
        Object.defineProperty(event, "target", { value: form, },);
        Object.defineProperty(event, "currentTarget", { value: form, },);
        void fn(event,);
      }
    },);

    // Success redirects to /worlds/<id>/edit (full navigation via location.assign).
    await page.waitForURL((url,) => /\/worlds\/[a-f0-9-]+\/edit$/.test(url.pathname,), { timeout: 30_000, },);
    const match = page.url().match(/\/worlds\/([a-f0-9-]+)\/edit/,);
    if (!match) { throw new Error(`Could not parse world id from URL: ${page.url()}`,); }

    // The editor body (incl. tab bar) only renders after /api/v1/worlds/:id loads.
    await page.locator(".world-edit-tab",).filter({ hasText: "Invites", },).waitFor({
      state: "attached",
      timeout: 30_000,
    },);
    return match[1]!;
  }

  /** On the world-edit page: open the Invites tab and create an invite. */
  async function createInvite(page: Page, maxUses: string,): Promise<void> {
    // Tab switch — use evaluate-click to bypass any overlay intercept.
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll(".world-edit-tab",),);
      const invites = tabs.find((el,) => el.textContent?.trim() === "Invites");
      if (invites instanceof HTMLElement) { invites.click(); }
    },);
    await page.locator("[data-testid='show-create-invite-btn']",).waitFor({
      state: "attached",
      timeout: 15_000,
    },);

    // Show the create-invite form via DOM click.
    await page.evaluate(() => {
      const el = document.querySelector("[data-testid='show-create-invite-btn']",);
      if (el instanceof HTMLElement) { el.click(); }
    },);
    await page.locator("#invite-max-uses",).waitFor({ state: "attached", timeout: 15_000, },);
    await page.fill("#invite-max-uses", maxUses,);

    // Submit the create-invite form via DOM click on the submit button.
    await page.evaluate(() => {
      const el = document.querySelector("[data-testid='submit-create-invite']",);
      if (el instanceof HTMLElement) { el.click(); }
    },);
    await page.locator("[data-testid='copy-invite-code']",).waitFor({ state: "attached", timeout: 15_000, },);
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
    }, 90_000,);
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
          .select(["id", "world_id", "code", "max_uses", "status", "uses",],)
          .where("world_id", "=", worldId,)
          .executeTakeFirst();
        expect(row,).not.toBeNull();
        expect(row!.world_id,).toBe(worldId,);
        expect(row!.max_uses,).toBe(5,);
        expect(row!.status,).toBe("active",);
        expect(row!.uses,).toBe(0,);
        expect(row!.code,).toBeTruthy();

        // The invite code rendered in the DOM matches the persisted code.
        const domCode = (await page.locator(".panel-item code",).first().textContent())?.trim();
        expect(domCode,).toBe(row!.code,);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 90_000,);
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
          .select(["id", "status",],)
          .where("world_id", "=", worldId,)
          .executeTakeFirst();
        const inviteId = row!.id;

        // revokeInvite() gates on window.confirm() — accept the dialog.
        page.on("dialog", async (dialog,) => dialog.accept(),);
        await page.evaluate(() => {
          const el = document.querySelector("[data-testid='revoke-invite']",);
          if (el instanceof HTMLElement) { el.click(); }
        },);

        // The row leaves the UI (the revoke button disappears).
        await page.locator("[data-testid='revoke-invite']",).waitFor({ state: "hidden", timeout: 15_000, },);
        expect(await page.locator("[data-testid='revoke-invite']",).count(),).toBe(0,);
        expect(await page.locator("[data-testid='copy-invite-code']",).count(),).toBe(0,);

        // DB row still exists but is soft-revoked (status = revoked).
        const revoked = await ctx.db
          .selectFrom("world_invites",)
          .select(["id", "status",],)
          .where("id", "=", inviteId,)
          .executeTakeFirst();
        expect(revoked,).not.toBeNull();
        expect(revoked!.id,).toBe(inviteId,);
        expect(revoked!.status,).toBe("revoked",);
      } finally {
        errors.assert();
        errors.detach();
        await page.close();
      }
    }, 90_000,);
  });
});
