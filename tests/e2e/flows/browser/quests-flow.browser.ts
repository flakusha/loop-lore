// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Quests Flow (world-scoped)
 *
 * Verifies the /views/quests?worldId=<id> UI under solo auth:
 *  - a seeded quest for a solo-owned world renders in the list
 *  - creating a quest through the form persists to the quests table
 */

import { PublicationStatus, QuestStatus, QuestType, } from "@/db/enums";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type BrowserTestContext, createBrowserTest, } from "../../helpers/browser-server";
import { trackPageErrors, } from "../../helpers/htmx-alpine";
import { SEED, } from "../../helpers/seed";

const WORLD_ID = "d1000001-0000-4000-a000-000000000001";
const QUEST_ID = "d1000002-0000-4000-a000-000000000001";
const QUEST_NAME = "E2E Seeded Quest";
const NEW_QUEST_NAME = `E2E New Quest ${Date.now()}`;

describe("Quests flow E2E", () => {
  let ctx: BrowserTestContext;

  beforeAll(async () => {
    ctx = await createBrowserTest();
    await ctx.db
      .insertInto("worlds",)
      .values({
        id: WORLD_ID,
        owner_id: SEED.solo.id,
        name: "E2E Quest World",
        description: "Seeded for e2e",
        publication_status: PublicationStatus.Published,
      },)
      .execute();
    await ctx.db
      .insertInto("quests",)
      .values({
        id: QUEST_ID,
        world_id: WORLD_ID,
        creator_id: SEED.solo.id,
        name: QUEST_NAME,
        description: "Seeded for e2e",
        type: QuestType.Discovery,
        status: QuestStatus.Active,
        priority: 1,
        target: 1,
        config: "{}",
        progress: 0,
        rewards: "{}",
        narrative_hooks: "[]",
      },)
      .execute();
  }, 90_000,);

  afterAll(async () => {
    await ctx?.close();
  },);

  async function gotoQuests(
    page: Awaited<ReturnType<BrowserTestContext["browser"]["newPage"]>>,
    worldId: string,
  ) {
    await page.goto(`${ctx.url}/views/quests?worldId=${worldId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    },);
    await page.locator("[data-testid='quests-header']",).waitFor({ state: "attached", timeout: 30_000, },);
  }

  test("seeded quest renders for the world", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoQuests(page, WORLD_ID,);
      await page.getByText(QUEST_NAME,).waitFor({ state: "visible", timeout: 20_000, },);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);

  test("creating a quest persists to the quests table", async () => {
    const page = await ctx.openPage();
    const errors = trackPageErrors(page,);
    try {
      await gotoQuests(page, WORLD_ID,);
      await page.getByText(QUEST_NAME,).waitFor({ state: "visible", timeout: 20_000, },);
      // Drive creation through the REAL create form: pick a completion
      // mechanic + narrative category, submit, and assert persistence.
      await page.getByText("+ New Quest",).click();
      await page.locator("input[placeholder='Quest name']",).fill(NEW_QUEST_NAME,);
      // Mechanic select: choose "collection" (schema-valid QuestType).
      const typeSelect = page.locator("select[x-model='createType']",);
      await typeSelect.selectOption("collection",);
      // Category select: choose "bounty" (narrative axis).
      const categorySelect = page.locator("select[x-model='createCategory']",);
      await categorySelect.selectOption("bounty",);
      await page.getByRole("button", { name: "Create", },).click();
      // Reload so the list re-fetches and renders the new quest.
      await gotoQuests(page, WORLD_ID,);
      await page.getByText(NEW_QUEST_NAME,).waitFor({ state: "visible", timeout: 20_000, },);
      const row = await ctx.db
        .selectFrom("quests",)
        .select(["id", "type", "category",],)
        .where("world_id", "=", WORLD_ID,)
        .where("name", "=", NEW_QUEST_NAME,)
        .executeTakeFirst();
      expect(row,).not.toBeNull();
      expect(row?.type,).toBe("collection",);
      expect(row?.category,).toBe("bounty",);
    } finally {
      errors.assert();
      errors.detach();
      await page.close();
    }
  }, 60_000,);
});
