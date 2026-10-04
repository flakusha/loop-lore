// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * End-to-end seam: values written through the public API must actually reach
 * `resolveAutonomyConfig`.
 *
 * `resolver.test.ts` seeds the columns with raw SQL, so it cannot catch a
 * mismatch between what the routes accept and what the resolver reads — a
 * mis-encoded field, or a layer that never persists at all, would leave that
 * suite green while the settings page silently did nothing. These tests go
 * route → column → resolver.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { updateChat, } from "../../chat/service";
import { createChat, } from "../../chat/service/crud/create";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { manageRoutes, } from "../../routes/chats/manage";
import type { HandlerOpts, } from "../../routes/chats/types";
import type { HandleOpts, } from "../../routes/worlds/types";
import { worldRoutes, } from "../../routes/worlds/worlds-routes";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { resolveAutonomyConfig, } from "./index";
import { PRESETS, } from "./presets";

const BASE = "http://localhost";

describe("autonomy config API → resolver seam", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let chatId: string;
  let app: Elysia;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    userId = uid();
    await insertUsers(db, `u-${userId}`, "Autonomy User", { id: userId, } as never,);
    await insertActors(db, userId, {
      id: userId,
      user_id: userId,
      owner_id: userId,
    } as never,);

    app = new Elysia({ name: "test-autonomy-seam", },)
      .derive(() => ({ userId, userRole: "user", }))
      .use(worldRoutes({ database: db, config: {} as Config, } as HandleOpts,),)
      .use(manageRoutes({ database: db, config: {} as Config, } as HandlerOpts,),) as unknown as Elysia;

    const created = await app.handle(
      new Request(`${BASE}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Seam World", },),
      },),
    );

    expect(created.status,).toBe(201,);
    worldId = ((await created.json()) as { id: string }).id;

    chatId = await createChat(db, {
      name: "Seam Chat",
      type: "direct",
      mode: "story",
      createdBy: userId,
      worldId,
      participantIds: [userId,],
    },);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  /**
   * @param cfg - the autonomyConfig field to send
   * @returns the PUT response
   */
  async function putWorld(cfg: unknown,): Promise<Response> {
    return app.handle(
      new Request(`${BASE}/api/worlds/${worldId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ autonomyConfig: cfg, },),
      },),
    );
  }

  it("a world preset saved through the API drives the resolved config", async () => {
    const res = await putWorld({ preset: "brisk", },);
    expect(res.status,).toBe(200,);

    const cfg = await resolveAutonomyConfig(db, { worldId, chatId, },);
    expect(cfg.preset,).toBe("brisk",);
    expect(cfg.tickIntervalMs,).toBe(PRESETS.brisk.tickIntervalMs,);
  });

  it("a chat preset saved through updateChat overrides the world one", async () => {
    await putWorld({ preset: "brisk", },);
    const res = await updateChat(db, chatId, { autonomyConfig: { preset: "serene", }, },);
    expect(res,).toEqual({ ok: true, },);

    const cfg = await resolveAutonomyConfig(db, { worldId, chatId, },);
    expect(cfg.preset,).toBe("serene",);
    expect(cfg.tickIntervalMs,).toBe(PRESETS.serene.tickIntervalMs,);
  });

  it("chat and world layers merge per field, not per object", async () => {
    // World sets the cap, the chat sets only the preset: both must survive.
    await putWorld({ preset: "brisk", perAgentCap: 7, },);
    await updateChat(db, chatId, { autonomyConfig: { preset: "serene", }, },);

    const cfg = await resolveAutonomyConfig(db, { worldId, chatId, },);
    expect(cfg.preset,).toBe("serene",);
    expect(cfg.perAgentCap,).toBe(7,);
  });

  it("clearing the chat layer falls back to the world preset", async () => {
    await putWorld({ preset: "brisk", },);
    await updateChat(db, chatId, { autonomyConfig: { preset: "serene", }, },);
    expect((await resolveAutonomyConfig(db, { worldId, chatId, },)).preset,).toBe("serene",);

    await updateChat(db, chatId, { autonomyConfig: {}, },);
    expect((await resolveAutonomyConfig(db, { worldId, chatId, },)).preset,).toBe("brisk",);
  });

  it("clearing the world layer falls back to the preset default", async () => {
    await putWorld({ preset: "brisk", },);
    expect((await resolveAutonomyConfig(db, { worldId, chatId, },)).preset,).toBe("brisk",);

    await putWorld(null,);
    expect((await resolveAutonomyConfig(db, { worldId, chatId, },)).preset,).toBe("organic",);
  });

  it("a chat override can re-enable a world the owner disabled", async () => {
    await putWorld({ enabled: false, },);
    // No chat override present → the world layer decides.
    expect((await resolveAutonomyConfig(db, { worldId, chatId, },)).enabled,).toBe(false,);

    // Layering means the highest layer wins - a chat that explicitly opts in
    // is not silently ignored by a world-level default.
    await updateChat(db, chatId, { autonomyConfig: { enabled: true, }, },);
    expect((await resolveAutonomyConfig(db, { worldId, chatId, },)).enabled,).toBe(true,);
  });
});
