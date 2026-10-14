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

  test("uses alt_text as label when present", async () => {
    await db.insertInto("assets",).values({
      id: "asset-alt",
      owner_id: userId,
      filename: "photo.jpg",
      alt_text: "A sunset",
      mime_type: "image/jpeg",
      asset_type: "image",
      size_bytes: 20,
      storage_path: "/tmp/photo.jpg",
    },).execute();

    await db.insertInto("asset_links",).values({
      asset_id: "asset-alt",
      entity_type: "location",
      entity_id: "loc-1",
      label: null,
    },).execute();

    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/memory/knowledge-graph",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { nodes: { id: string; label: string }[]; edges: { label: unknown }[] };
    const altNode = body.nodes.find((n,) => n.id === "asset:asset-alt");
    expect(altNode?.label,).toBe("A sunset",);
    expect(body.edges.some((e,) => e.label === null),).toBe(true,);
  });

  test("filters links for assets not owned by user", async () => {
    const otherId = "other-user";
    await insertUsers(db, otherId, "Other", { id: otherId, } as never,);
    await db.insertInto("assets",).values({
      id: "asset-other",
      owner_id: otherId,
      filename: "other.png",
      mime_type: "image/png",
      asset_type: "image",
      size_bytes: 5,
      storage_path: "/tmp/other.png",
    },).execute();

    await db.insertInto("asset_links",).values({
      asset_id: "asset-other",
      entity_type: "character",
      entity_id: "char-1",
      label: "owns",
    },).execute();

    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/memory/knowledge-graph",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { nodes: { id: string }[]; edges: { source: string }[] };
    expect(body.nodes.some((n,) => n.id === "asset:asset-other"),).toBe(false,);
    expect(body.edges.some((e,) => e.source === "asset:asset-other"),).toBe(false,);
  });

  test("deduplicates entity nodes across multiple links", async () => {
    await db.insertInto("assets",).values({
      id: "asset-2",
      owner_id: userId,
      filename: "img2.png",
      mime_type: "image/png",
      asset_type: "image",
      size_bytes: 15,
      storage_path: "/tmp/img2.png",
    },).execute();

    await db.insertInto("asset_links",).values([
      { asset_id: "asset-1", entity_type: "character", entity_id: "char-2", label: "depicts", },
      { asset_id: "asset-2", entity_type: "character", entity_id: "char-1", label: "references", },
    ],).execute();

    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/memory/knowledge-graph",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { nodes: { id: string }[]; edges: unknown[] };
    const charNodes = body.nodes.filter((n,) => n.id === "entity:character:char-1");
    expect(charNodes.length,).toBe(1,);
    expect(body.edges.length,).toBe(4,);
  });
});
