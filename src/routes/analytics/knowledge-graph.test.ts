// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { analyticsRoutes, } from "./index";

function createApp(db: Kysely<DB>, userId: string | null,) {
  return new Elysia({ name: "test-kg", },)
    .derive(() => ({ userId, }))
    .use(analyticsRoutes({ database: db, },),) as unknown as Elysia;
}

describe("GET /api/memory/knowledge-graph", () => {
  let db: Kysely<DB>;
  const userId = "kg-user";
  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await insertUsers(db, userId, "KG User", { id: userId, } as never,);
    await db.insertInto("assets",).values({
      id: "asset-1",
      owner_id: userId,
      filename: "img.png",
      mime_type: "image/png",
      asset_type: "image",
      size_bytes: 10,
      storage_path: "/tmp/img.png",
    },).execute();

    await db.insertInto("asset_links",).values({
      asset_id: "asset-1",
      entity_type: "character",
      entity_id: "char-1",
      label: "illustrates",
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/memory/knowledge-graph",),);
    expect(res.status,).toBe(401,);
  });

  test("returns nodes + edges for seeded fixture", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/memory/knowledge-graph",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { nodes: unknown[]; edges: unknown[] };
    expect(body.nodes.length,).toBe(2,);
    expect(body.edges,).toEqual([{
      source: "asset:asset-1",
      target: "entity:character:char-1",
      label: "illustrates",
    },],);
  });
});
