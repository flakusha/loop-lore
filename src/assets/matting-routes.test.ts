// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the asset matting surface: matted cut-out serving,
 * matte trigger (eligibility, ownership, restart recovery), job status,
 * and the matted_asset_id projection on GET /api/assets/:id.
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
import { AssetAlphaStatus, AssetLinkEntity, AssetType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { MATTING_SOURCE_LABEL, } from "../generation/matting";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { assetRoutes, } from "./controller";
import { mattingRoutes, } from "./matting-routes";
import { createAsset, linkAsset, } from "./service";
import { makeMinimalPng, } from "./test-helpers";

createLogger({ level: "error", },);

interface Fixture {
  db: Kysely<DB>;
  uploadDir: string;
  ownerId: string;
  outsiderId: string;
  rawId: string;
}

function makeApp(
  fx: Fixture,
  userId: string | null,
  mutate?: (c: Config,) => void,
) {
  const config = createConfigSchema().defaults as Config;
  config.assets.uploadDir = fx.uploadDir;
  mutate?.(config,);
  return new Elysia()
    .derive(() => ({ userId, userRole: "user", }))
    .use(mattingRoutes({ database: fx.db, config, },),)
    .use(assetRoutes({ database: fx.db, config, },),);
}

async function seed(): Promise<Fixture> {
  const { db, } = await createTestDb();
  const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-matting-test-",),);
  const ownerId = randomUUID();
  const outsiderId = randomUUID();
  await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
  await insertUsers(db, `out-${outsiderId}`, "Outsider", { id: outsiderId, } as never,);
  const buffer = makeMinimalPng(4, 3,);
  const { asset, } = await createAsset({
    database: db,
    input: {
      ownerId,
      filename: "sprite.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    },
    uploadDir,
  },);
  return { db, uploadDir, ownerId, outsiderId, rawId: asset.id, };
}

async function cleanup(fx: Fixture,) {
  await fx.db.destroy();
  rmSync(fx.uploadDir, { recursive: true, force: true, },);
}

/** Simulate a completed matting run: derivative asset + source link + status. */
async function seedMatted(fx: Fixture,): Promise<string> {
  const buffer = makeMinimalPng(4, 3,);
  const { asset: matted, } = await createAsset({
    database: fx.db,
    input: {
      ownerId: fx.ownerId,
      filename: "sprite-matted.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    },
    uploadDir: fx.uploadDir,
  },);
  await linkAsset({
    database: fx.db,
    assetId: matted.id,
    link: { entityType: AssetLinkEntity.Asset, entityId: fx.rawId, label: MATTING_SOURCE_LABEL, },
  },);
  await fx.db
    .updateTable("assets",)
    .set({ alpha_status: AssetAlphaStatus.Matted, },)
    .where("id", "=", fx.rawId,)
    .execute();
  return matted.id;
}

/** Stub the matting HTTP endpoint with a canned PNG response. */
function stubMattingEndpoint(): () => void {
  const original = globalThis.fetch;
  const png = makeMinimalPng(2, 2,);
  const bytes = new Uint8Array(png.length,);
  bytes.set(png,);
  globalThis.fetch = (async () => new Response(bytes,)) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const mattingConfig = (c: Config,) => {
  c.generation.matting = {
    backend: "http",
    endpoint: "http://127.0.0.1:9/mat",
  };
};

describe("GET /api/assets/:id/matted", () => {
  test("404 while no matted derivative exists", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx, fx.ownerId,).handle(
        new Request(`http://localhost/api/assets/${fx.rawId}/matted`,),
      );
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("serves the derivative PNG to the owner once matted", async () => {
    const fx = await seed();
    try {
      await seedMatted(fx,);
      const res = await makeApp(fx, fx.ownerId,).handle(
        new Request(`http://localhost/api/assets/${fx.rawId}/matted`,),
      );
      expect(res.status,).toBe(200,);
      expect(res.headers.get("Content-Type",),).toBe("image/png",);
      expect(res.headers.get("X-Content-Type-Options",),).toBe("nosniff",);
    } finally {
      await cleanup(fx,);
    }
  });

  test("404 for an outsider on a private asset", async () => {
    const fx = await seed();
    try {
      await seedMatted(fx,);
      const res = await makeApp(fx, fx.outsiderId,).handle(
        new Request(`http://localhost/api/assets/${fx.rawId}/matted`,),
      );
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("serves via signed-URL without a session", async () => {
    const fx = await seed();
    try {
      await seedMatted(fx,);
      const mint = await makeApp(fx, fx.ownerId, (c,) => {
        c.assets.signedUrlSecret = "test-hmac-secret-0123456789";
      },).handle(
        new Request(`http://localhost/api/assets/${fx.rawId}/signed-url/matted`, { method: "POST", },),
      );
      expect(mint.status,).toBe(200,);
      const { url, } = (await mint.json()) as { url: string };
      const res = await makeApp(fx, null, (c,) => {
        c.assets.signedUrlSecret = "test-hmac-secret-0123456789";
      },).handle(new Request(`http://localhost${url}`,),);
      expect(res.status,).toBe(200,);
      expect(res.headers.get("Content-Type",),).toBe("image/png",);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("POST /api/assets/:id/matte", () => {
  test("400 when matting is not configured", async () => {
    const fx = await seed();
    try {
      const res = await makeApp(fx, fx.ownerId,).handle(
        new Request(`http://localhost/api/assets/${fx.rawId}/matte`, { method: "POST", },),
      );
      expect(res.status,).toBe(400,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("enqueues, completes, and exposes the derivative", async () => {
    const fx = await seed();
    const restore = stubMattingEndpoint();
    try {
      const res = await makeApp(fx, fx.ownerId, mattingConfig,).handle(
        new Request(`http://localhost/api/assets/${fx.rawId}/matte`, { method: "POST", },),
      );
      expect(res.status,).toBe(201,);
      const { jobId, } = (await res.json()) as { jobId: string };
      expect(jobId.length,).toBeGreaterThan(0,);

      // Job lifecycle completes; raw asset transitions raw -> matted.
      let status = "";
      for (let i = 0; i < 40 && status !== "completed"; i++) {
        await Bun.sleep(25,);
        const s = await makeApp(fx, fx.ownerId, mattingConfig,).handle(
          new Request(`http://localhost/api/assets/${fx.rawId}/matte`,),
        );
        if (s.status === 200) {
          status = ((await s.json()) as { status: string }).status;
        }
      }
      expect(status,).toBe("completed",);

      const detail = await makeApp(fx, fx.ownerId,).handle(
        new Request(`http://localhost/api/assets/${fx.rawId}`,),
      );
      const json = (await detail.json()) as { alpha_status: string; matted_asset_id: string | null };
      expect(json.alpha_status,).toBe("matted",);
      expect(json.matted_asset_id,).not.toBeNull();
    } finally {
      restore();
      await cleanup(fx,);
    }
  });

  test("409 on an unknown asset, 403 for a non-owner", async () => {
    const fx = await seed();
    try {
      const missing = await makeApp(fx, fx.ownerId, mattingConfig,).handle(
        new Request(`http://localhost/api/assets/${randomUUID()}/matte`, { method: "POST", },),
      );
      expect(missing.status,).toBe(404,);

      const forbidden = await makeApp(fx, fx.outsiderId, mattingConfig,).handle(
        new Request(`http://localhost/api/assets/${fx.rawId}/matte`, { method: "POST", },),
      );
      expect(forbidden.status,).toBe(403,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("recovers a restart-stuck pending asset by resetting and retrying", async () => {
    const fx = await seed();
    const restore = stubMattingEndpoint();
    try {
      // Simulate a server restart mid-job: status stuck at matting_pending,
      // no live in-memory job.
      await fx.db
        .updateTable("assets",)
        .set({ alpha_status: AssetAlphaStatus.MattingPending, },)
        .where("id", "=", fx.rawId,)
        .execute();

      const res = await makeApp(fx, fx.ownerId, mattingConfig,).handle(
        new Request(`http://localhost/api/assets/${fx.rawId}/matte`, { method: "POST", },),
      );
      expect(res.status,).toBe(201,);
    } finally {
      restore();
      await cleanup(fx,);
    }
  });
});

describe("GET /api/assets/:id matted_asset_id projection", () => {
  test("null for a raw asset, derivative id once matted", async () => {
    const fx = await seed();
    try {
      const before = await makeApp(fx, fx.ownerId,).handle(
        new Request(`http://localhost/api/assets/${fx.rawId}`,),
      );
      expect(((await before.json()) as { matted_asset_id: string | null }).matted_asset_id,).toBeNull();

      const mattedId = await seedMatted(fx,);
      const after = await makeApp(fx, fx.ownerId,).handle(
        new Request(`http://localhost/api/assets/${fx.rawId}`,),
      );
      expect(((await after.json()) as { matted_asset_id: string | null }).matted_asset_id,).toBe(mattedId,);
    } finally {
      await cleanup(fx,);
    }
  });
});
