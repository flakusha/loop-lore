// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for GET/PUT /api/assets/:id/transform.
 *
 * Pins the face-anchor trust boundary:
 *   - GET resolves context → default fallback (sprite reads the seeded default).
 *   - GET 404s with no rows, 400s on invalid context, hides private assets.
 *   - PUT is owner-only (401 anonymous, 404 outsider), 400s on invalid values.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import { AssetType, AssetVisibility, TransformContext, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../test-utils/insert-helpers";
import { assetRoutes, } from "./controller";
import { getAssetTransform, seedBaseTransform, } from "./service/transforms";

const OWNER_ID = randomUUID();
const OUTSIDER_ID = randomUUID();
const ASSET_ID = randomUUID();

function makeApp(db: Kysely<DB>, userId: string | null,) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, userRole: "user", }))
    .use(assetRoutes({ database: db, config, },),);
}

async function seed(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertUsers(db, `out-${OUTSIDER_ID}`, "Outsider", { id: OUTSIDER_ID, } as never,);
  await insertAssets(db, OWNER_ID, "sprite.png", "image/png", AssetType.Image, 1024, "/tmp/sprite.png", {
    id: ASSET_ID,
    visibility: AssetVisibility.Private,
  },);
  await seedBaseTransform(db, ASSET_ID,);
}

describe("GET /api/assets/:id/transform", () => {
  test("resolves sprite context to the seeded default row", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const res = await makeApp(db, OWNER_ID,).handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/transform?context=sprite`,),
    );
    expect(res.status,).toBe(200,);
    const json = (await res.json()) as { context: string; focal_point_x: number; focal_point_y: number };
    expect(json.context,).toBe(TransformContext.Default,);
    expect(json.focal_point_x,).toBe(0.5,);
    expect(json.focal_point_y,).toBe(0.35,);
    await db.destroy();
  });

  test("404 when the asset has no transform rows", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    await db.deleteFrom("asset_transforms",).where("asset_id", "=", ASSET_ID,).execute();
    const res = await makeApp(db, OWNER_ID,).handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/transform?context=sprite`,),
    );
    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("400 on invalid context", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const res = await makeApp(db, OWNER_ID,).handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/transform?context=bogus`,),
    );
    expect(res.status,).toBe(400,);
    await db.destroy();
  });

  test("404 for outsider on a private asset", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const res = await makeApp(db, OUTSIDER_ID,).handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/transform?context=sprite`,),
    );
    expect(res.status,).toBe(404,);
    await db.destroy();
  });
});

describe("PUT /api/assets/:id/transform", () => {
  test("owner upsert persists and round-trips focal values", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const res = await makeApp(db, OWNER_ID,).handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/transform`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ context: TransformContext.Sprite, focalPointX: 0.4, focalPointY: 0.3, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const row = await getAssetTransform(db, ASSET_ID, TransformContext.Sprite,);
    expect(row?.focal_point_x,).toBe(0.4,);
    expect(row?.focal_point_y,).toBe(0.3,);
    await db.destroy();
  });

  test("401 when unauthenticated", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const res = await makeApp(db, null,).handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/transform`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ focalPointX: 0.4, },),
      },),
    );
    expect(res.status,).toBe(401,);
    await db.destroy();
  });

  test("404 for non-owner", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const res = await makeApp(db, OUTSIDER_ID,).handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/transform`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ focalPointX: 0.4, },),
      },),
    );
    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("400 on out-of-range focal value", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const res = await makeApp(db, OWNER_ID,).handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/transform`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ focalPointX: 2, },),
      },),
    );
    expect(res.status,).toBe(400,);
    await db.destroy();
  });

  test("400 on invalid context", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const res = await makeApp(db, OWNER_ID,).handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/transform`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ context: "bogus", focalPointX: 0.4, },),
      },),
    );
    expect(res.status,).toBe(400,);
    await db.destroy();
  });
});
