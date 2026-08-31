// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration tests for the signed-URL asset flow.
 *
 * Verifies the full round-trip through the Elysia assetRoutes plugin:
 *   POST /api/assets/:id/signed-url/:action  →  GET /api/assets/:id/raw?...sig...
 *
 * Covers: valid signed serve, expired rejection, tampered rejection, and
 * fail-closed when no secret is configured.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Config, } from "../../config/schema";
import { AssetType, AssetVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { assetRoutes, } from "./routes";

const SECRET = "integration-test-hmac-secret";
const OWNER = "owner-1";
const ASSET_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

/**
 * @param uploadDir
 * @param secret
 */
function makeConfig(uploadDir: string, secret: string | undefined,): Config {
  return {
    assets: {
      enabled: true,
      uploadDir,
      maxFileSize: 10_485_760,
      compression: true,
      signedUrlSecret: secret,
      signedUrlExpirySeconds: 900,
    },
    auth: { jwtSecret: secret, },
  } as unknown as Config;
}

/**
 * @param db
 * @param userId
 * @param userRole
 * @param config
 */
function createApp(db: Kysely<DB>, userId: string | null, userRole: string | null, config: Config,): Elysia {
  return new Elysia({ name: "test-asset-signed", },)
    .derive(() => ({ userId, userRole, }))
    .use(assetRoutes({ database: db, config, },),) as unknown as Elysia;
}

describe("signed URL asset flow", () => {
  let db: Kysely<DB>;
  let uploadDir: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-signed-",),);

    await insertUsers(db, OWNER, "Asset Owner", { id: OWNER as never, },);
    await insertAssets(
      db,
      OWNER,
      "hero.png",
      "image/png",
      AssetType.Image,
      4,
      `raw/${ASSET_ID.slice(0, 2,)}/${ASSET_ID.slice(2, 4,)}/${ASSET_ID}.png`,
      { id: ASSET_ID as never, visibility: AssetVisibility.Public as never, storage_backend: "local" as never, },
    );

    // Write a real file so serving returns bytes.
    const sub = `${ASSET_ID.slice(0, 2,)}/${ASSET_ID.slice(2, 4,)}`;
    const dir = join(uploadDir, "raw", sub,);
    mkdirSync(dir, { recursive: true, },);
    writeFileSync(join(dir, `${ASSET_ID}.png`,), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10,],),);
  },);

  afterAll(async () => {
    await db.destroy();
    rmSync(uploadDir, { recursive: true, force: true, },);
  },);

  test("generates a signed URL that serves the asset", async () => {
    const app = createApp(db, OWNER, "user", makeConfig(uploadDir, SECRET,),);

    const genRes = await app.handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/signed-url/raw`, { method: "POST", },),
    );
    expect(genRes.status,).toBe(200,);
    const gen = (await genRes.json()) as { url: string; token: string; expiresAt: number };
    expect(gen.url,).toStartWith(`/api/assets/${ASSET_ID}/raw?expires=`,);
    expect(gen.url,).toContain("sig=",);

    // Serve the raw asset via the signed URL — no session (userId null) needed.
    const serveApp = createApp(db, null, null, makeConfig(uploadDir, SECRET,),);
    const res = await serveApp.handle(new Request(`http://localhost${gen.url}`,),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toBe("image/png",);
    const body = new Uint8Array(await res.arrayBuffer(),);
    expect(Array.from(body,),).toEqual([137, 80, 78, 71, 13, 10, 26, 10,],);
  });

  test("signed URL cannot serve a different action", async () => {
    const app = createApp(db, OWNER, "user", makeConfig(uploadDir, SECRET,),);
    const gen = await app.handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/signed-url/raw`, { method: "POST", },),
    );
    const { url, } = (await gen.json()) as { url: string };

    // Reuse the raw signature but hit the download path.
    const downloadUrl = url.replace("/raw?", "/download?",);
    const res = await app.handle(new Request(`http://localhost${downloadUrl}`,),);
    expect(res.status,).toBe(403,);
  });

  test("rejects an expired signed URL", async () => {
    const app = createApp(db, null, null, makeConfig(uploadDir, SECRET,),);
    // Sign with an expiry already in the past via a direct module call.
    const { signAssetUrl, } = await import("./signed-url");
    const signed = await signAssetUrl({
      secret: SECRET,
      assetId: ASSET_ID,
      action: "raw",
      expiresInSeconds: -1,
      now: Date.now(),
    },);

    const res = await app.handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/raw?expires=${signed.expiresAt}&sig=${signed.token}`,),
    );
    expect(res.status,).toBe(403,);
  });

  test("rejects a tampered signature", async () => {
    const app = createApp(db, null, null, makeConfig(uploadDir, SECRET,),);
    const res = await app.handle(
      new Request(
        `http://localhost/api/assets/${ASSET_ID}/raw?expires=${Date.now() + 60_000}&sig=${"x".repeat(43,)}`,
      ),
    );
    expect(res.status,).toBe(403,);
  });

  test("serve fails closed when no secret is configured", async () => {
    const app = createApp(db, null, null, makeConfig(uploadDir, "",),);
    // A signed URL request with no secret configured → 403 (cannot verify).
    const res = await app.handle(
      new Request(
        `http://localhost/api/assets/${ASSET_ID}/raw?expires=${Date.now() + 60_000}&sig=${"a".repeat(64,)}`,
      ),
    );
    expect(res.status,).toBe(403,);
  });

  test("signed-url generation is gated by asset access", async () => {
    // Private asset: only the owner can generate a signed URL.
    const privateId = "p1p2p3p4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    await insertAssets(
      db,
      OWNER,
      "private.txt",
      "text/plain",
      AssetType.Image,
      4,
      `raw/${privateId.slice(0, 2,)}/${privateId.slice(2, 4,)}/${privateId}.png`,
      { id: privateId as never, visibility: AssetVisibility.Private as never, storage_backend: "local" as never, },
    );

    const ownerApp = createApp(db, OWNER, "user", makeConfig(uploadDir, SECRET,),);
    const ownerRes = await ownerApp.handle(
      new Request(`http://localhost/api/assets/${privateId}/signed-url/raw`, { method: "POST", },),
    );
    expect(ownerRes.status,).toBe(200,);

    const otherApp = createApp(db, "intruder", "user", makeConfig(uploadDir, SECRET,),);
    const otherRes = await otherApp.handle(
      new Request(`http://localhost/api/assets/${privateId}/signed-url/raw`, { method: "POST", },),
    );
    expect(otherRes.status,).toBe(404,);
  });

  test("rejects unknown signed-url action", async () => {
    const app = createApp(db, OWNER, "user", makeConfig(uploadDir, SECRET,),);
    const res = await app.handle(
      new Request(`http://localhost/api/assets/${ASSET_ID}/signed-url/delete`, { method: "POST", },),
    );
    expect(res.status,).toBe(400,);
  });
});
