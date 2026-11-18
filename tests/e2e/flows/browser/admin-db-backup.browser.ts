// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Admin -> Backups tab - snapshot creation + restore confirmation gate.
 *
 * Verifies:
 *  - clicking "create" adds a row to the snapshot list
 *  - the restore confirm button stays disabled until "RESTORE" is typed
 *
 * Never executes the restore (it replaces the live database). Logs in as the
 * seeded admin (auth.required=true). Isolated per-file server + db + backup dir.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { AUTH_NOISE_ALLOWLIST, trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, seedUsers, } from "../../helpers/seed";

describe("Admin database backup E2E", () => {
  let ctx: BrowserTestContext;
  let backupDir: string;
  let previousBackupDir: string | undefined;

  beforeAll(async () => {
    // The backup dir is read when the admin routes register, before the first
    // page loads - point it at a temp tree so no snapshot touches real state.
    previousBackupDir = process.env.LOOP_LORE_BACKUP_DIR;
    backupDir = mkdtempSync(join(tmpdir(), "ll-e2e-db-backup-",),);
    process.env.LOOP_LORE_BACKUP_DIR = backupDir;
    ctx = await createBrowserTest({ auth: { required: true, }, },);
    await seedUsers(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
    if (previousBackupDir === undefined) {
      delete process.env.LOOP_LORE_BACKUP_DIR;
    } else {
      process.env.LOOP_LORE_BACKUP_DIR = previousBackupDir;
    }

    if (backupDir) { rmSync(backupDir, { recursive: true, force: true, },); }
  },);

  /** One login per file: the auth endpoint is rate limited per server process. */
  let sessionReady = false;

  async function openAdminPage() {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    try {
      if (!sessionReady) {
        await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
        await page.locator("[data-testid='login-submit']",).waitFor({ state: "visible", timeout: 30_000, },);
        await page.fill("[data-testid='username-input']", SEED.admin.username,);
        await page.fill("[data-testid='password-input']", SEED.admin.password,);
        const loginRes = page.waitForResponse(
          (res,) => res.url().includes("/api/v1/auth/login",) && res.request().method() === "POST",
          { timeout: 30_000, },
        );

        await page.click("[data-testid='login-submit']",);
        expect((await loginRes).status(),).toBe(200,);
        await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
        sessionReady = true;
      }

      await page.goto(`${ctx.url}/views/admin`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
      await page.locator("[data-testid='admin-header']",).waitFor({ state: "visible", timeout: 15_000, },);
      return { page, errors, };
    } catch (error) {
      errors.detach();
      await page.close();
      throw error;
    }
  }

  test("creates a snapshot row and gates restore behind typed confirmation", async () => {
    const { page, errors, } = await openAdminPage();
    try {
      await page.click("[data-testid='admin-tab-backups']",);
      await page.locator("[data-testid='db-backup-panel']",).waitFor({ state: "visible", timeout: 15_000, },);

      const before = await page.locator("[data-testid='db-backup-row']",).count();
      await page.click("[data-testid='db-backup-create']",);
      // Snapshots from an earlier run may already be listed, so wait for the
      // count to grow rather than for the first row to appear.
      await page.waitForFunction(
        (count: number,) => document.querySelectorAll("[data-testid='db-backup-row']",).length > count,
        before,
        { timeout: 30_000, },
      );

      const row = page.locator("[data-testid='db-backup-row']",).last();
      await row.locator("[data-testid='db-backup-restore-open']",).click();
      const confirm = page.locator("[data-testid='db-backup-confirm']",);
      await confirm.waitFor({ state: "visible", timeout: 10_000, },);

      const confirmBtn = confirm.locator("[data-testid='db-backup-confirm-restore']",);
      expect(await confirmBtn.isDisabled(), "restore must be disabled before confirmation",).toBe(true,);
      await confirm.locator("[data-testid='db-backup-confirmation']",).fill("RESTORE",);
      expect(await confirmBtn.isEnabled(), "restore must unlock once RESTORE is typed",).toBe(true,);
      // Deliberately never click confirmBtn: restore replaces the live database.
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 90_000,);
});
