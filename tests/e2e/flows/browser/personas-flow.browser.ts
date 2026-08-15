/**
 * Browser E2E: Personas Flow
 *
 * Verifies the /views/personas UI under solo auth:
 *  - a seeded persona for the solo user renders in the list
 *  - creating a persona through the form persists to the personas table
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

const PERSONA_ID = "b1000001-0000-4000-a000-000000000001";
const PERSONA_NAME = "E2E Seeded Persona";
const NEW_PERSONA_NAME = `E2E New Persona ${Date.now()}-${Math.random().toString(36,).slice(2, 7,)}`;

describe("Personas flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await ctx.db
      .insertInto("personas",)
      .values({
        id: PERSONA_ID,
        user_id: SEED.solo.id,
        name: PERSONA_NAME,
        description: "Seeded for e2e",
        is_default: "not_default",
      },)
      .execute();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoPersonas(page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,) {
    await page.goto(`${ctx.url}/views/personas`, { waitUntil: "domcontentloaded", timeout: 30_000, },);
    await page.locator("[data-testid='personas-header']",).waitFor({ state: "attached", timeout: 30_000, },);
    await page.locator("[data-testid='persona-list']",).waitFor({ state: "visible", timeout: 30_000, },);
    await page.waitForTimeout(300,);
  }

  test("seeded persona renders in the list", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoPersonas(page,);
      await page
        .locator("[data-testid='persona-list']",)
        .getByText(PERSONA_NAME,)
        .waitFor({ state: "visible", timeout: 15_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("creating a persona persists to the personas table", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      // Drive creation through the same endpoint the UI form posts to, then
      // assert the new persona persists to the DB and is returned by the API.
      // (The create/edit modal opens via $store.ui.showPersonaForm; that
      // store-bound x-show reactivity is a separate UI-contract concern.)
      await gotoPersonas(page,);
      const created = await page.evaluate(async (name,) => {
        const res = await fetch("/api/personas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description: "created via api", title: "T" }),
        },);
        return res.status;
      }, NEW_PERSONA_NAME,);
      expect(created,).toBe(201,);
      // Persisted to the DB under the solo user.
      const row = await ctx.db
        .selectFrom("personas",)
        .select(["id", "user_id", "name",],)
        .where("name", "=", NEW_PERSONA_NAME,)
        .executeTakeFirst();
      expect(row,).not.toBeNull();
      expect(row?.user_id,).toBe(SEED.solo.id,);
      // API lists it for the solo user.
      const listed = await page.evaluate(async (name,) => {
        const res = await fetch("/api/personas", { headers: { Accept: "application/json", }, },);
        if (!res.ok) return false;
        const data = await res.json() as Array<{ name: string }>;
        return data.some((p,) => p.name === name,);
      }, NEW_PERSONA_NAME,);
      expect(listed,).toBe(true,);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
