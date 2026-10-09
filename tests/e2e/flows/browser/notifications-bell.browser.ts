// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Chat-header notification bell
 *
 * Covers the notificationsBell() surface in src/components/chat/chat-header.html
 * (the existing notifications-flow suite only covers the /views/notifications
 * list render + mark-all-read):
 *  - the bell badge renders the current unread count
 *  - one notification marked read from the bell dropdown (badge decrements,
 *    exactly that row flips to read)
 *  - one notification dismissed from the bell dropdown (row deleted)
 * plus the single mark-read path on /views/notifications, where
 * notificationCenter.onOpen() PATCHes exactly one row.
 */

import type { Page, } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, waitForAlpineReady, waitForAlpineState, } from "../../helpers/htmx-alpine";
import { SEED, seedAll, } from "../../helpers/seed";

const BELL = "[data-testid='notifications-bell']";
const BELL_TOGGLE = "[data-testid='notifications-bell-toggle']";
const BELL_BADGE = "[data-testid='notifications-bell-badge']";
const BELL_DROPDOWN = "[data-testid='notifications-bell-dropdown']";

/** Baseline rows: two unread (badge count), one already read (must not count). */
const NOTIF_A = "c2000001-0000-4000-a000-000000000001";
const NOTIF_B = "c2000001-0000-4000-a000-000000000002";
const NOTIF_READ = "c2000001-0000-4000-a000-000000000003";
/** Per-test targets. */
const NOTIF_MARK = "c2000001-0000-4000-a000-000000000004";
const NOTIF_DISMISS = "c2000001-0000-4000-a000-000000000005";
const NOTIF_CENTER = "c2000001-0000-4000-a000-000000000006";

interface BellState {
  open: boolean;
  unreadCount: number;
  items: Array<{ id: string; read: number }>;
}

describe("Chat-header notification bell E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await seedAll(ctx.db,);
    await seedNotification(NOTIF_A, "Bell baseline A", "unread",);
    await seedNotification(NOTIF_B, "Bell baseline B", "unread",);
    await seedNotification(NOTIF_READ, "Bell baseline read", "read",);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function seedNotification(id: string, title: string, status: "read" | "unread",): Promise<void> {
    await ctx.db
      .insertInto("notifications",)
      .values({
        id,
        user_id: SEED.solo.id,
        type: "system",
        title,
        body: "Seeded for e2e",
        read: status,
      },)
      .execute();
  }

  async function unreadCountInDb(): Promise<number> {
    const rows = await ctx.db
      .selectFrom("notifications",)
      .select(["id",],)
      .where("user_id", "=", SEED.solo.id,)
      .where("read", "=", "unread",)
      .execute();

    return rows.length;
  }

  async function notificationRow(id: string,) {
    return ctx.db
      .selectFrom("notifications",)
      .select(["read",],)
      .where("id", "=", id,)
      .executeTakeFirst();
  }

  async function gotoChat(page: Page,): Promise<void> {
    await page.goto(`${ctx.url}/views/chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='chat-header']",).waitFor({ state: "attached", timeout: 30_000, },);
    await page.locator(BELL,).waitFor({ state: "attached", timeout: 30_000, },);
    await waitForAlpineReady(page, 15_000,);
  }

  /**
   * Web-first wait until the bell component AND its rendered badge both show
   * exactly `expected` — no sleeps, just Alpine-state + DOM polling.
   */
  async function waitForBadge(page: Page, expected: number,): Promise<void> {
    await waitForAlpineState<BellState>(page, BELL, (state,) => state.unreadCount === expected, 15_000,);
    await page.waitForFunction(
      (want,) => document.querySelector("[data-testid='notifications-bell-badge']",)?.textContent === want,
      String(expected,),
      { timeout: 15_000, },
    );
  }

  /**
   * Open the bell dropdown. The toggle is clicked from inside the page because
   * the fixed #notification-bell-host bell (layout.html, z-index 1200) overlays
   * the header's right corner — same evaluate-click precedent as
   * world-invites.browser.ts / navigateViaHtmx for overlay-blocked controls.
   */
  async function openBellDropdown(page: Page,): Promise<void> {
    await page.evaluate((selector,) => {
      const el = document.querySelector<HTMLElement>(selector,);
      if (!el) { throw new Error(`bell toggle not found: ${selector}`,); }
      el.click();
    }, BELL_TOGGLE,);

    await page.locator(BELL_DROPDOWN,).waitFor({ state: "visible", timeout: 15_000, },);
  }

  test("bell badge renders the unread count", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      const expected = await unreadCountInDb();
      expect(expected,).toBeGreaterThan(0,);

      await gotoChat(page,);
      await waitForBadge(page, expected,);

      expect(await page.locator(BELL_BADGE,).textContent(),).toBe(String(expected,),);
      expect(await page.locator(BELL,).isVisible(),).toBe(true,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("marking one notification read from the bell decrements the badge", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await seedNotification(NOTIF_MARK, "Bell mark-read target", "unread",);
      const expected = await unreadCountInDb();

      await gotoChat(page,);
      await waitForBadge(page, expected,);

      await openBellDropdown(page,);
      const item = page.locator(`[data-testid='notifications-bell-item-${NOTIF_MARK}']`,);
      await item.waitFor({ state: "visible", timeout: 15_000, },);
      await page.locator(`[data-testid='notifications-bell-mark-read-${NOTIF_MARK}']`,).click();

      await waitForBadge(page, expected - 1,);
      // The ✓ control hides once the item flips to read.
      await page
        .locator(`[data-testid='notifications-bell-mark-read-${NOTIF_MARK}']`,)
        .waitFor({ state: "hidden", timeout: 15_000, },);

      expect((await notificationRow(NOTIF_MARK,))?.read,).toBe("read",);
      // Only the clicked row flipped; its siblings stay unread.
      expect((await notificationRow(NOTIF_A,))?.read,).toBe("unread",);
      expect((await notificationRow(NOTIF_B,))?.read,).toBe("unread",);
      expect((await notificationRow(NOTIF_READ,))?.read,).toBe("read",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("dismissing one notification from the bell deletes the row", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await seedNotification(NOTIF_DISMISS, "Bell dismiss target", "unread",);
      const expected = await unreadCountInDb();

      await gotoChat(page,);
      await waitForBadge(page, expected,);

      await openBellDropdown(page,);
      const item = page.locator(`[data-testid='notifications-bell-item-${NOTIF_DISMISS}']`,);
      await item.waitFor({ state: "visible", timeout: 15_000, },);
      await page.locator(`[data-testid='notifications-bell-dismiss-${NOTIF_DISMISS}']`,).click();

      await item.waitFor({ state: "detached", timeout: 15_000, },);
      await waitForBadge(page, expected - 1,);

      expect(await notificationRow(NOTIF_DISMISS,),).toBeUndefined();
      // Neighbours are untouched: the unread baselines persist, the read one stays read.
      expect((await notificationRow(NOTIF_A,))?.read,).toBe("unread",);
      expect((await notificationRow(NOTIF_B,))?.read,).toBe("unread",);
      expect((await notificationRow(NOTIF_READ,))?.read,).toBe("read",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("clicking a notification on /views/notifications marks only that row read", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await seedNotification(NOTIF_CENTER, "Center mark-read target", "unread",);
      const expected = await unreadCountInDb();

      await page.goto(`${ctx.url}/views/notifications`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='notifications-header']",).waitFor({ state: "attached", timeout: 30_000, },);
      await waitForAlpineReady(page, 15_000,);

      const item = page.locator(`[data-testid='notification-${NOTIF_CENTER}']`,);
      await item.waitFor({ state: "visible", timeout: 30_000, },);

      // notificationCenter.onOpen() flips the row optimistically before the
      // PATCH lands — wait for the response so the DB assertion is race-free.
      const patched = page.waitForResponse(
        (res,) => res.request().method() === "PATCH" && res.url().includes(`/api/v1/notifications/${NOTIF_CENTER}`,),
        { timeout: 15_000, },
      );

      await item.click();
      await patched;

      await item.locator("[data-testid='notifications-unread']",).waitFor({ state: "hidden", timeout: 15_000, },);

      expect((await notificationRow(NOTIF_CENTER,))?.read,).toBe("read",);
      expect(await unreadCountInDb(),).toBe(expected - 1,);
      expect((await notificationRow(NOTIF_A,))?.read,).toBe("unread",);
      expect((await notificationRow(NOTIF_B,))?.read,).toBe("unread",);
      // Mark-all-read stays available while other rows remain unread.
      expect(await page.locator("[data-testid='notifications-mark-all-read']",).isVisible(),).toBe(true,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
