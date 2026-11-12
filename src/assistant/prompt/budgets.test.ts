// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * resolveSectionBudget — per-world context-share ratio (1.0.0 THEME 4 AC5).
 *
 * Verifies the composition `clamp(configBudget * worlds.prompt_budget_ratio)`
 * against a real migrated DB: neutral worlds keep the config budget, scaled
 * worlds multiply within the global ceiling, and out-of-bounds stored values
 * clamp defensively (math edges: 0, negative, >1, huge live in the pure
 * tests in packages/core/src/config/sections/prompt.test.ts).
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { PromptSection, } from "../../config/sections/prompt";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { resolveSectionBudget, worldBudgetRatio, } from "./budgets";
import type { AssembleContext, } from "./types";

/** Minimal section ctx — only the fields `resolveSectionBudget` consumes. */
type BudgetCtx = Pick<AssembleContext, "db" | "chat" | "config">;

const configWith = (lore: number, memory: number,): BudgetCtx["config"] =>
  ({ prompt: new PromptSection({ loreTokenBudget: lore, memoryTokenBudget: memory, },), }) as BudgetCtx["config"];

const ctxFor = (db: Kysely<DB>, worldId: string | null, config: BudgetCtx["config"],): BudgetCtx => ({
  db,
  chat: { id: "budget-chat", mode: "story", world_id: worldId, current_location_id: null, },
  config,
});

async function setupWorldWithRatio(db: Kysely<DB>, ratio?: number,): Promise<string> {
  await insertUsers(db, "gm", "GM",);
  const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
  await insertWorlds(db, user.id, "Budget World",);
  const world = await db.selectFrom("worlds",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
  if (ratio !== undefined) {
    // Write the raw value directly — the route validates bounds, the read
    // side must survive anything a hand-edit (or old client) stored.
    await db.updateTable("worlds",).set({ prompt_budget_ratio: ratio, },).where("id", "=", world.id,).execute();
  }

  return world.id;
}

describe("resolveSectionBudget — per-world context-share ratio", () => {
  test("worldless chats keep the bare config budget", async () => {
    const { db, } = await createTestDb();
    try {
      const budget = await resolveSectionBudget(
        ctxFor(db, null, configWith(256, 512,),),
        "lore",
      );

      expect(budget,).toBe(256,);
    } finally {
      await db.destroy();
    }
  });

  test("default-ratio worlds keep the config budget", async () => {
    const { db, } = await createTestDb();
    try {
      const worldId = await setupWorldWithRatio(db,);
      expect(await worldBudgetRatio(db, worldId,),).toBe(1,);
      expect(
        await resolveSectionBudget(
          ctxFor(db, worldId, configWith(256, 512,),),
          "memory",
        ),
      ).toBe(512,);
    } finally {
      await db.destroy();
    }
  });

  test("a scaled world multiplies both sections within the ceiling", async () => {
    const { db, } = await createTestDb();
    try {
      const worldId = await setupWorldWithRatio(db, 2,);
      const ctx = ctxFor(db, worldId, configWith(256, 512,),);
      expect(await resolveSectionBudget(ctx, "lore",),).toBe(512,);
      expect(await resolveSectionBudget(ctx, "memory",),).toBe(1024,);
      // A huge ratio clamps to the ratio max (×4), then the product re-clamps
      // into the global bounds: 256 × 4 = 1024 stays under the ceiling.
      await db.updateTable("worlds",).set({ prompt_budget_ratio: 1e9, },).where("id", "=", worldId,).execute();
      expect(await resolveSectionBudget(ctx, "lore",),).toBe(1024,);
      // Only a base above 2048 actually reaches the 8192 ceiling at ratio max.
      const bigCtx = ctxFor(db, worldId, configWith(4096, 4096,),);
      expect(await resolveSectionBudget(bigCtx, "lore",),).toBe(8192,);
    } finally {
      await db.destroy();
    }
  });

  test("out-of-bounds stored ratios clamp defensively", async () => {
    const { db, } = await createTestDb();
    try {
      // 0 / negative floor at the ratio minimum; the product then re-clamps
      // into the global bounds, so 400 × 0.25 lands on the 128-token floor.
      const zeroWorld = await setupWorldWithRatio(db, 0,);
      expect(
        await resolveSectionBudget(
          ctxFor(db, zeroWorld, configWith(400, 400,),),
          "lore",
        ),
      ).toBe(128,);

      await db.updateTable("worlds",).set({ prompt_budget_ratio: -10, },).where("id", "=", zeroWorld,).execute();
      expect(
        await resolveSectionBudget(
          ctxFor(db, zeroWorld, configWith(400, 400,),),
          "memory",
        ),
      ).toBe(128,);
    } finally {
      await db.destroy();
    }
  });

  test("missing world rows resolve neutral", async () => {
    const { db, } = await createTestDb();
    try {
      expect(await worldBudgetRatio(db, "no-such-world",),).toBe(1,);
    } finally {
      await db.destroy();
    }
  });
});
