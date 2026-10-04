// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-user ACL tests for the asset links/shares READ routes.
 *
 * `GET /assets/:id/links` and `GET /assets/:id/shares` take the asset id from
 * the path and used to call only `requireUserId`, which proves the caller is
 * logged in but not that they own the asset. `getAssetLinks`/`getAssetShares`
 * key on `asset_id` alone, so the guard has to live in the route.
 *
 * Each test covers the denial (outsider gets nothing) and the positive path
 * (the owner still reads their own graph), because a guard that also blocks the
 * owner is not a fix.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import { AssetType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { assetRoutes, } from "./controller";
import { createAsset, } from "./service";
import { makeMinimalPng, } from "./test-helpers";

interface Fixture {
  db: Kysely<DB>;
  uploadDir: string;
  ownerId: string;
  outsiderId: string;
  assetId: string;
}

function makeApp(db: Kysely<DB>, userId: string | null, uploadDir: string, prefix = "/api",) {
  const config = createConfigSchema().defaults as Config;
  config.assets.uploadDir = uploadDir;
  return new Elysia()
    .derive(() => ({ userId, userRole: "user", }))
    .use(assetRoutes({ database: db, config, }, prefix,),);
}

async function seed(): Promise<Fixture> {
  const { db, } = await createTestDb();
  const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-asset-acl-",),);
  const ownerId = randomUUID();
  const outsiderId = randomUUID();
  await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
  await insertUsers(db, `out-${outsiderId}`, "Outsider", { id: outsiderId, } as never,);
  // asset_shares FKs point at actors.id — mirror each user as an actor.
  await db.insertInto("actors",).values({ id: ownerId, display_name: "Owner Actor", },).execute();
  await db.insertInto("actors",).values({ id: outsiderId, display_name: "Outsider Actor", },).execute();
  const buffer = makeMinimalPng(4, 3,);
  const { asset, } = await createAsset({
    database: db,
    input: {
      ownerId,
      filename: "private.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    },
    uploadDir,
  },);

  // The owner's link graph and share list: the data the outsider must not see.
  await db
    .insertInto("asset_links",)
    .values({ asset_id: asset.id, entity_type: "character", entity_id: "char-secret", label: "hero portrait", },)
    .execute();
  await db
    .insertInto("asset_shares",)
    .values({ asset_id: asset.id, shared_with_id: outsiderId, shared_by_id: ownerId, },)
    .execute();

  return { db, uploadDir, ownerId, outsiderId, assetId: asset.id, };
}

async function cleanup(fx: Fixture,) {
  await fx.db.destroy();
  rmSync(fx.uploadDir, { recursive: true, force: true, },);
}

describe("GET /api/assets/:id/links (owner gate)", () => {
  test("404 for an outsider — never the owner's link graph", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.outsiderId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/links`,),
      );

      expect(res.status,).toBe(404,);
      expect(await res.text(),).not.toContain("char-secret",);
    } finally {
      await cleanup(fx,);
    }
  });

  test("401 when unauthenticated", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, null, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/links`,),
      );

      expect(res.status,).toBe(401,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("the owner still reads their own links", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/links`,),
      );

      expect(res.status,).toBe(200,);
      const links = (await res.json()) as { entity_id: string }[];
      expect(links.map((l,) => l.entity_id),).toEqual(["char-secret",],);
    } finally {
      await cleanup(fx,);
    }
  });
});

// requireAssetOwner deliberately answers BOTH "missing" and "not yours" with
// the same 404 body. If those two ever diverge again, the differing message is
// itself an existence oracle: a caller can probe arbitrary asset ids and read
// existence off the error text. Pinned here so the collapse cannot be reverted
// silently while every status-code assertion above stays green.
describe("requireAssetOwner returns one indistinguishable 404 body", () => {
  test("a missing asset and a non-owned asset are byte-identical", async () => {
    const fx = await seed();
    try {
      // Real asset, wrong owner.
      const notOwned = await makeApp(fx.db, fx.outsiderId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/links`,),
      );
      // Well-formed UUID that does not exist.
      const missing = await makeApp(fx.db, fx.outsiderId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${randomUUID()}/links`,),
      );

      // Read each body once — clone() after text() would hand back a
      // consumed body, so the bodies are captured before asserting.
      const notOwnedBody = await notOwned.text();
      const missingBody = await missing.text();
      expect(notOwned.status,).toBe(404,);
      expect(missing.status,).toBe(404,);
      expect(notOwnedBody,).toBe(missingBody,);
      expect(notOwnedBody,).toContain("Asset not found or not owner",);
    } finally {
      await cleanup(fx,);
    }
  });
});

// `assetRoutes` is mounted at BOTH /api and /api/v1 (routes/v1/content-surface.ts:44),
// and the frontend calls the v1 copy. The guard lives in the handler body, so it must
// hold at every mount — asserted here rather than assumed from the /api tests above.
describe("owner gate holds at the /api/v1 mount (the one the frontend calls)", () => {
  test("404 for an outsider on /api/v1/links", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.outsiderId, fx.uploadDir, "/api/v1",).handle(
        new Request(`http://localhost/api/v1/assets/${fx.assetId}/links`,),
      );

      expect(res.status,).toBe(404,);
      expect(await res.text(),).not.toContain("char-secret",);
    } finally {
      await cleanup(fx,);
    }
  });

  test("404 for an outsider on /api/v1/shares", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.outsiderId, fx.uploadDir, "/api/v1",).handle(
        new Request(`http://localhost/api/v1/assets/${fx.assetId}/shares`,),
      );

      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("401 unauthenticated and 200 for the owner on /api/v1/links", async () => {
    const fx = await seed();
    try {
      const anon = await makeApp(fx.db, null, fx.uploadDir, "/api/v1",).handle(
        new Request(`http://localhost/api/v1/assets/${fx.assetId}/links`,),
      );

      expect(anon.status,).toBe(401,);

      const owner = await makeApp(fx.db, fx.ownerId, fx.uploadDir, "/api/v1",).handle(
        new Request(`http://localhost/api/v1/assets/${fx.assetId}/links`,),
      );

      expect(owner.status,).toBe(200,);
      const links = (await owner.json()) as { entity_id: string }[];
      expect(links.map((l,) => l.entity_id),).toEqual(["char-secret",],);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("GET /api/assets/:id/shares (owner gate)", () => {
  test("404 for an outsider — never the owner's share list", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.outsiderId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/shares`,),
      );

      expect(res.status,).toBe(404,);
      expect(await res.text(),).not.toContain(fx.outsiderId,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("401 when unauthenticated", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, null, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/shares`,),
      );

      expect(res.status,).toBe(401,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("the owner still reads their own shares", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx.db, fx.ownerId, fx.uploadDir,).handle(
        new Request(`http://localhost/api/assets/${fx.assetId}/shares`,),
      );

      expect(res.status,).toBe(200,);
      const shares = (await res.json()) as { shared_with_id: string }[];
      expect(shares.map((s,) => s.shared_with_id),).toEqual([fx.outsiderId,],);
    } finally {
      await cleanup(fx,);
    }
  });
});
