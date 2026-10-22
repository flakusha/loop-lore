// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: New Chat Advanced Fields
 *
 * Verifies the /views/new-chat form's advanced-field surface:
 *  - chat-type, chat-mode, chat-template, persona-select, chat-world,
 *    chat-turn-strategy, chat-visibility, chat-visual-novel selects render
 *  - selecting a persona affects the create payload (verified via the form
 *    submit handler collecting the value and POSTing /api/v1/chats)
 *  - submitting the form creates a chat that lands in /views/chat with the
 *    new chat selected
 *
 * Logs in as the seeded `e2euser` before navigating (auth.required=true).
 */

import { CHAT_VARIANTS, VARIANT_DEFAULTS, } from "@/chat/types/variants";
import type { Page, } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { AUTH_NOISE_ALLOWLIST, trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, seedUsers, seedWorld, } from "../../helpers/seed";

type TestPage = Page;

describe("New chat advanced fields E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest({ auth: { required: true, }, },);
    await seedUsers(ctx.db,);
    // The world picker is filled from the user's own worlds - the RPG variant
    // test needs one to bind the chat to.
    await seedWorld(ctx.db,);
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
  }

  test("renders the chat-type, chat-mode, template, persona, world selects", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    try {
      await login(page,);
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
          user_id: SEED.user.id,
          name: "Advanced Persona",
          description: "persona for advanced fields test",
          title: "Tester",
        },)
        .execute();

      await login(page,);
      await gotoNewChat(page,);

      const personaSelect = page.locator("[data-testid='persona-select']",);
      await page.waitForFunction(
        (id,) => {
          const sel = document.querySelector("#persona-select",) as HTMLSelectElement | null;
          if (!sel) { return false; }
          return Array.from(sel.options,).some((o,) => o.value === id);
        },
        personaId,
        { timeout: 10_000, },
      );

      const createRes = page.waitForResponse(
        (res,) => res.url().includes("/api/v1/chats",) && res.request().method() === "POST",
        { timeout: 15_000, },
      );

      const name = `Advanced-Chat-${Date.now()}`;
      await page.fill("[data-testid='chat-name-input']", name,);
      await page.locator("[data-testid='chat-mode-select']",).selectOption("story",);
      await personaSelect.selectOption(personaId,);
      await page.click("[data-testid='create-chat-btn']",);

      const res = await createRes;
      expect(res.status(), `chat create should succeed (got ${res.status()})`,).toBeLessThan(400,);

      // The create response body is NOT the id source: handleCreateSuccess reads
      // it, attaches the persona and then calls location.assign(), and Playwright
      // discards the body once that navigation commits - so a read racing the
      // navigation resolves to null under load. The unique name above is what
      // the create POST committed, so match the row on it instead.
      const row = await ctx.db
        .selectFrom("chats",)
        .select(["id", "name", "mode", "created_by",],)
        .where("name", "=", name,)
        .executeTakeFirst();

      expect(row, `create should commit a chat row named ${name}`,).not.toBeNull();
      const createdId = row!.id;
      expect(row!.name,).toBe(name,);
      expect(row!.mode,).toBe("story",);
      expect(row!.created_by,).toBe(SEED.user.id,);

      // The persona is attached by a SECOND client request (PUT
      // /api/v1/chats/:id/persona, best-effort in submit.ts handleCreateSuccess),
      // not by the create POST. One read races that PUT and returns null, so poll
      // for the link within a bounded 30 x 200ms = 6s budget and stop on the first
      // match. The attempt count is the bound: the loop cannot hang.
      let link: { persona_id: string | null } | undefined;
      for (let attempt = 0; attempt < 30; attempt++) {
        const candidate = await ctx.db
          .selectFrom("chat_participants",)
          .select(["persona_id",],)
          .where("chat_id", "=", createdId,)
          .where("actor_id", "=", SEED.user.id,)
          .executeTakeFirst();

        if (candidate?.persona_id === personaId) {
          link = candidate;
          break;
        }

        await new Promise((resolve,) => setTimeout(resolve, 200,));
      }

      expect(link?.persona_id, "persona should be linked to participant",).toBe(personaId,);

      await page.waitForURL((url,) => url.pathname === "/views/chat", { timeout: 30_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 90_000,);

  test("the variant picker offers every canonical variant and pins the chosen one on create", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    try {
      await login(page,);
      await gotoNewChat(page,);

      const values = await page
        .locator("[data-testid='chat-variant']",)
        .evaluate((el,) => Array.from((el as HTMLSelectElement).options,).map((o,) => o.value));

      expect([...values,].sort(),).toEqual(["standard", ...CHAT_VARIANTS,].sort(),);

      // A variant chat is server-owned: the form's type/mode are inert and the
      // RPG variants require a world.
      const variantSelect = page.locator("[data-testid='chat-variant']",);
      const typeSelect = page.locator("[data-testid='chat-type-select']",);
      const modeSelect = page.locator("[data-testid='chat-mode-select']",);
      const worldSelect = page.locator("[data-testid='chat-world']",);

      await variantSelect.selectOption("rpg",);
      expect(await worldSelect.evaluate((el,) => (el as HTMLSelectElement).required),).toBe(true,);
      expect(await typeSelect.evaluate((el,) => (el as HTMLSelectElement).disabled),).toBe(true,);
      expect(await modeSelect.evaluate((el,) => (el as HTMLSelectElement).disabled),).toBe(true,);

      await variantSelect.selectOption("standard",);
      expect(await worldSelect.evaluate((el,) => (el as HTMLSelectElement).required),).toBe(false,);
      expect(await typeSelect.evaluate((el,) => (el as HTMLSelectElement).disabled),).toBe(false,);
      expect(await modeSelect.evaluate((el,) => (el as HTMLSelectElement).disabled),).toBe(false,);

      const createReq = page.waitForRequest(
        (req,) => req.url().includes("/api/v1/chats",) && req.method() === "POST",
        { timeout: 15_000, },
      );

      const name = `Variant-Chat-${Date.now()}`;
      await page.fill("[data-testid='chat-name-input']", name,);
      await page.locator("[data-testid='chat-variant']",).selectOption("assistant",);
      await page.click("[data-testid='create-chat-btn']",);

      const body = (await createReq).postDataJSON() as { variant?: string };
      expect(body.variant,).toBe("assistant",);

      const row = await ctx.db
        .selectFrom("chats",)
        .select(["id", "type", "mode", "purpose",],)
        .where("name", "=", name,)
        .executeTakeFirst();

      expect(row, `create should commit a chat row named ${name}`,).not.toBeNull();
      expect(row!.type,).toBe(VARIANT_DEFAULTS.assistant.chat_type,);
      expect(row!.mode,).toBe(VARIANT_DEFAULTS.assistant.chat_mode,);
      expect(row!.purpose,).toBe(VARIANT_DEFAULTS.assistant.chat_purpose,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 90_000,);

  test("an RPG variant chat is bound to the world the user picked", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page, { allowlist: AUTH_NOISE_ALLOWLIST, },);
    try {
      await login(page,);
      await gotoNewChat(page,);

      const variantSelect = page.locator("[data-testid='chat-variant']",);
      const worldSelect = page.locator("[data-testid='chat-world']",);

      // The world picker is filled from the user's own worlds.
      await worldSelect
        .locator(`option[value="${SEED.world.id}"]`,)
        .waitFor({ state: "attached", timeout: 15_000, },);

      await variantSelect.selectOption("rpg",);
      await worldSelect.selectOption(SEED.world.id,);

      const name = `RPG-Variant-Chat-${Date.now()}`;
      await page.fill("[data-testid='chat-name-input']", name,);

      const createReq = page.waitForRequest(
        (req,) => req.url().includes("/api/v1/chats",) && req.method() === "POST",
        { timeout: 15_000, },
      );

      await page.click("[data-testid='create-chat-btn']",);

      // The world is the one field the variant does NOT own: it must survive
      // the payload even though the variant pins type/mode/purpose.
      const body = (await createReq).postDataJSON() as { variant?: string; worldId?: string };
      expect(body.variant,).toBe("rpg",);
      expect(body.worldId,).toBe(SEED.world.id,);

      const row = await ctx.db
        .selectFrom("chats",)
        .select(["id", "type", "mode", "purpose", "world_id",],)
        .where("name", "=", name,)
        .executeTakeFirst();

      expect(row, `create should commit a chat row named ${name}`,).not.toBeNull();
      expect(row!.world_id,).toBe(SEED.world.id,);
      expect(row!.type,).toBe(VARIANT_DEFAULTS.rpg.chat_type,);
      expect(row!.mode,).toBe(VARIANT_DEFAULTS.rpg.chat_mode,);
      expect(row!.purpose,).toBe(VARIANT_DEFAULTS.rpg.chat_purpose,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 90_000,);
});
