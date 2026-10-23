// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedCharacter, seedUsers, seedWorld, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

const ACTOR_ID = SEED.character.id;
const WORLD_ID = SEED.world.id;

const STATS = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8, };

describe("Stat Allocation E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer({ auth: { required: true, }, },);
    api = createClient(server.url,);
    await seedUsers(server.db,);
    await seedCharacter(server.db,);
    await seedWorld(server.db,);
    await api.loginAs(SEED.user.username, SEED.user.password,);
  },);

  afterAll(async () => {
    await server.close();
  },);

  test("trait catalog returns universal list for unknown world", async () => {
    const res = await api.get("/api/v1/rpg/trait-catalog?worldId=nope",);

    expect(res.ok,).toBe(true,);
    const body = res.data as { id: string; scope: string }[];

    expect(body.length,).toBeGreaterThan(0,);
    expect(body.every((trait,) => trait.scope === "universal"),).toBe(true,);
    expect(body.some((trait,) => trait.id === "fast_reflexes"),).toBe(true,);
  });

  test("trait catalog scopes shadowfell traits to that world", async () => {
    const res = await api.get("/api/v1/rpg/trait-catalog?worldId=shadowfell",);

    expect(res.ok,).toBe(true,);
    const body = res.data as { id: string; scope: string }[];

    expect(body.some((trait,) => trait.id === "shadow_step" && trait.scope === "world"),).toBe(true,);
  });

  test("PUT persists allocation then GET reads back", async () => {
    const put = await api.put(`/api/v1/rpg/stat-allocation/${ACTOR_ID}`, {
      worldId: WORLD_ID,
      stats: STATS,
      traitIds: ["fast_reflexes",],
    },);

    expect(put.ok,).toBe(true,);

    const get = await api.get(`/api/v1/rpg/stat-allocation/${ACTOR_ID}`,);

    expect(get.ok,).toBe(true,);
    const body = get.data as { stats: typeof STATS; traitIds: string[] };

    expect(body.stats,).toEqual(STATS,);
    expect(body.traitIds,).toEqual(["fast_reflexes",],);
  });

  test("stat-config serves live world bounds", async () => {
    const res = await api.get(`/api/v1/rpg/stat-config?worldId=${WORLD_ID}`,);

    expect(res.ok,).toBe(true,);
    const body = res.data as { statPointBudget: number; statMin: number; statMax: number };

    expect(body.statPointBudget,).toBeGreaterThan(0,);
    expect(body.statMin,).toBeLessThanOrEqual(body.statMax,);
  });

  test("PUT rejects budget overflow with 422", async () => {
    const over = { str: 15, dex: 15, con: 15, int: 15, wis: 15, cha: 15, };
    const res = await api.put(`/api/v1/rpg/stat-allocation/${ACTOR_ID}`, {
      worldId: WORLD_ID,
      stats: over,
      traitIds: [],
    },);

    expect(res.ok,).toBe(false,);
    expect(res.status,).toBe(422,);
  });
});
