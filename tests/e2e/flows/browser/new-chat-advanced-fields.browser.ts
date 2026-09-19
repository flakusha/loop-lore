// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: New Chat Advanced Fields
 *
 * Verifies the /views/new-chat form's advanced-field surface:
 *  - chat-type, chat-mode, chat-template, persona-select, chat-world,
 *    chat-turn-strategy, chat-visibility, chat-visual-novel selects render
 *  - selecting a persona affects the create payload (verified via the form
 *    submit handler collecting the value and POSTing /api/chats)
 *  - submitting the form creates a chat that lands in /views/chat with the
 *    new chat selected
 *
 * Pre-logs in via seeded data (demo/solo mode).
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { AUTH_NOISE_ALLOWLIST, trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, seedUsers, } from "../../helpers/seed";

type TestPage = Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>;

describe("New chat advanced fields E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true } });
    await seedUsers(ctx.db,);
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function login(page: TestPage,) {
    await page.goto(`${ctx.url}/views/login`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='login-submit']",).waitFor({ state: "visible", timeout: 30_000, },);
    await page.fill("[data-testid='username-input']", SEED.user.username,);
    await page.fill("[data-testid='password-input']", SEED.user.password,);
    await page.click("[data-testid='login-submit']",);
    await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
  }

  async function gotoNewChat(page: TestPage,) {
    await page.goto(`${ctx.url}/views/new-chat`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='new-chat-header']",).waitFor({ state: "attached", timeout: 30_000, },);
    await page.locator("[data-testid='create-chat-form']",).waitFor({ state: "attached", timeout: 30_000, },);
    await page.waitForTimeout(300,);
  }

  test("renders the chat-type, chat-mode, template, persona, world selects", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    try {
      await gotoNewChat(page,);
      await page.locator("[data-testid='chat-name-input']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='chat-type-select']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='chat-mode-select']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='chat-template-select']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='persona-select']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='chat-world']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='chat-turn-strategy']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='chat-visibility']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='chat-visual-novel']",).waitFor({ state: "attached", timeout: 10_000, },);
      await page.locator("[data-testid='create-chat-btn']",).waitFor({ state: "attached", timeout: 10_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("submitting the form with persona + mode persists a chat that lands on /views/chat", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    try {
      const personaId = `b1000aaa-0000-4000-a000-${"0".repeat(12,)}`;
      await ctx.db
        .insertInto("personas",)
        .values({
          id: personaId,
          user_id: SEED.solo.id,
          name: "Advanced Persona",
          description: "persona for advanced fields test",
          title: "Tester",
        },)
        .execute();

      await gotoNewChat(page,);

      const personaSelect = page.locator("[data-testid='persona-select']",);
      await page.waitForFunction(
        (id,) => {
          const sel = document.querySelector("#persona-select",) as HTMLSelectElement | null;
          if (!sel) { return false; }
          return Array.from(sel.options,).some((o,) => o.value === id,);
        },
        personaId,
        { timeout: 10_000, },
      );

      const createRes = page.waitForResponse(
        (res,) => res.url().includes("/api/chats",) && res.request().method() === "POST",
        { timeout: 15_000, },
      );

      const name = `Advanced-Chat-${Date.now()}`;
      await page.fill("[data-testid='chat-name-input']", name,);
      await page.locator("[data-testid='chat-mode-select']",).selectOption("story",);
      await personaSelect.selectOption(personaId,);
      await page.click("[data-testid='create-chat-btn']",);

      const res = await createRes;
      expect(res.status(), `chat create should succeed (got ${res.status()})`,).toBeLessThan(400,);
      const body = (await res.json()) as { id?: string; data?: { id?: string } };
      const createdId = body.id ?? body.data?.id;
      expect(createdId, "create response should carry chat id",).toBeDefined();

      const row = await ctx.db
        .selectFrom("chats",)
        .select(["id", "name", "mode", "created_by"],)
        .where("id", "=", createdId!,)
        .executeTakeFirst();
      expect(row,).not.toBeNull();
      expect(row!.name,).toBe(name,);
      expect(row!.mode,).toBe("story",);
      expect(row!.created_by,).toBe(SEED.solo.id,);

      const link = await ctx.db
        .selectFrom("chat_participants",)
        .select(["persona_id"],)
        .where("chat_id", "=", createdId!,)
        .where("actor_id", "=", SEED.solo.id,)
        .executeTakeFirst();
      expect(link?.persona_id, "persona should be linked to participant",).toBe(personaId,);

      await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 90_000,);
});
