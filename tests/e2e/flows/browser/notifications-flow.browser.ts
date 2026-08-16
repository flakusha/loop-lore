// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Notifications Flow
 *
 * Verifies the /views/notifications UI under solo auth:
 *  - a seeded (unread) notification renders with the unread state
 *  - "mark all read" persists read=1 to the notifications table
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

const NOTIF_ID = "c1000001-0000-4000-a000-000000000001";
const NOTIF_TITLE = "E2E Test Notification";

describe("Notifications flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await ctx.db
      .insertInto("notifications",)
      .values({
        id: NOTIF_ID,
        user_id: SEED.solo.id,
        type: "system",
        title: NOTIF_TITLE,
        body: "Seeded for e2e",
        read: "unread",
      },)
      .execute();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoNotifications(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.goto(`${ctx.url}/views/notifications`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='notifications-header']",).waitFor({ state: "attached", timeout: 30_000, },);
    await page
      .locator(`[data-testid='notification-${NOTIF_ID}']`,)
      .waitFor({ state: "visible", timeout: 30_000, },);
  }

  test("seeded notification renders with unread state", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoNotifications(page,);
      const item = page.locator(`[data-testid='notification-${NOTIF_ID}']`,);
      const cls = await item.getAttribute("class",);
      expect(cls,).toContain("unread",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("mark all read persists to the notifications table", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoNotifications(page,);
      await page.locator("[data-testid='notifications-mark-all-read']",).click();
      // Button hides once the unread count drops to zero.
      await page
        .locator("[data-testid='notifications-mark-all-read']",)
        .waitFor({ state: "hidden", timeout: 15_000, },);
      const row = await ctx.db
        .selectFrom("notifications",)
        .select(["read",],)
        .where("id", "=", NOTIF_ID,)
        .executeTakeFirst();
      expect(row,).not.toBeNull();
      expect(row!.read,).toBe("read",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
