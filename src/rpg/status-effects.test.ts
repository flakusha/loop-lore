// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, } from "../test-utils/insert-helpers";
import {
  applyStatusEffect,
  getActiveEffects,
  sweepExpiredEffects,
} from "./status-effects";

describe("shared status-effect store", () => {
  test("apply + read round-trips with expiry", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Hero", { id: "actor-hero", },);
    const id = await applyStatusEffect(db, {
      actorId: "actor-hero",
      effectId: "aphrodisiac_dose",
      category: "chemistry",
      magnitude: 2,
      source: "chemistry",
      durationSeconds: 3600,
      meta: { dose: "standard", },
    },);
    expect(typeof id,).toBe("string",);
    const active = await getActiveEffects(db, "actor-hero",);
    expect(active.length,).toBe(1,);
    expect(active[0]!.effectId,).toBe("aphrodisiac_dose",);
    expect(active[0]!.expiresAt,).not.toBeNull();
  });

  test("expired rows are invisible on read and removed by sweep", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Hero", { id: "actor-hero", },);
    await applyStatusEffect(db, {
      actorId: "actor-hero",
      effectId: "stale_arousal",
      category: "arousal",
      source: "test",
      durationSeconds: -1,
    },);
    expect(await getActiveEffects(db, "actor-hero",),).toEqual([],);
    expect(await sweepExpiredEffects(db,),).toBe(1,);
    expect(await sweepExpiredEffects(db,),).toBe(0,);
  });

  test("category and effectId filters scope reads", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Hero", { id: "actor-hero", },);
    await applyStatusEffect(db, {
      actorId: "actor-hero",
      effectId: "trauma_minor",
      category: "trauma",
      source: "test",
    },);
    await applyStatusEffect(db, {
      actorId: "actor-hero",
      effectId: "exhaustion",
      category: "physical",
      source: "test",
    },);
    expect((await getActiveEffects(db, "actor-hero", { category: "trauma", },)).length,).toBe(1,);
    expect((await getActiveEffects(db, "actor-hero", { effectId: "exhaustion", },)).length,).toBe(1,);
    expect(await getActiveEffects(db, "actor-hero", { category: "missing", },),).toEqual([],);
  });

  test("sweep never touches expiry-free rows", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Hero", { id: "actor-hero", },);
    await applyStatusEffect(db, {
      actorId: "actor-hero",
      effectId: "nsfw_reputation",
      category: "reputation",
      source: "test",
    },);
    expect(await sweepExpiredEffects(db,),).toBe(0,);
    expect((await getActiveEffects(db, "actor-hero",)).length,).toBe(1,);
  });
});
