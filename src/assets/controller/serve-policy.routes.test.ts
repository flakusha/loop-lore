// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Handler-level tests for asset serve cache/disposition policy.
 *
 * Exercises handleServeRaw through the real assetRoutes plugin with an
 * in-memory DB: visibility-aware Cache-Control, nosniff, and SVG
 * forced-attachment (raw navigation must not execute embedded script).
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
import { signAssetUrl, } from "./signed-url";

const OWNER = "owner-pol-1";
const POLICY_SECRET = "policy-test-secret";
const PNG_ID = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const SVG_ID = "c2b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function makeConfig(uploadDir: string,): Config {
  return {
    assets: {
      enabled: true,
      uploadDir,
      maxFileSize: 10_485_760,
      compression: true,
      signedUrlSecret: POLICY_SECRET,
      signedUrlExpirySeconds: 900,
    },
    auth: { jwtSecret: "test-secret", },
  } as unknown as Config;
}

function createApp(db: Kysely<DB>, config: Config,): Elysia {
  return new Elysia({ name: "test-asset-serve-policy", },)
    .derive(() => ({ userId: OWNER, userRole: "user", }))
    .use(assetRoutes({ database: db, config, },),) as unknown as Elysia;
}

describe("asset serve policy (handler-level)", () => {
  let db: Kysely<DB>;
  let uploadDir: string;
  let app: Elysia;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-policy-",),);

    await insertUsers(db, OWNER, "Policy Owner", { id: OWNER as never, },);
    await insertAssets(
      db,
      OWNER,
      "hero.png",
      "image/png",
      AssetType.Image,
      4,
      `raw/${PNG_ID.slice(0, 2,)}/${PNG_ID.slice(2, 4,)}/${PNG_ID}.png`,
      { id: PNG_ID as never, visibility: AssetVisibility.Private as never, storage_backend: "local" as never, },
    );
    await insertAssets(
      db,
      OWNER,
      "evil.svg",
      "image/svg+xml",
      AssetType.Image,
      4,
      `raw/${SVG_ID.slice(0, 2,)}/${SVG_ID.slice(2, 4,)}/${SVG_ID}.svg`,
      { id: SVG_ID as never, visibility: AssetVisibility.Private as never, storage_backend: "local" as never, },
    );

    const pngPath = join(uploadDir, "raw", PNG_ID.slice(0, 2,), PNG_ID.slice(2, 4,),);
    mkdirSync(pngPath, { recursive: true, },);
    writeFileSync(join(pngPath, `${PNG_ID}.png`,), "PNGDATA",);
    const svgPath = join(uploadDir, "raw", SVG_ID.slice(0, 2,), SVG_ID.slice(2, 4,),);
    mkdirSync(svgPath, { recursive: true, },);
    writeFileSync(join(svgPath, `${SVG_ID}.svg`,), "<svg xmlns='http://www.w3.org/2000/svg'/>",);

    app = createApp(db, makeConfig(uploadDir,),);
  },);

  afterAll(() => {
    rmSync(uploadDir, { recursive: true, force: true, },);
  },);

  test("private PNG: Cache-Control private + nosniff, inline", async () => {
    const res = await app.handle(new Request(`http://local/api/assets/${PNG_ID}/raw`,),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("cache-control",),).toBe("private, max-age=3600",);
    expect(res.headers.get("x-content-type-options",),).toBe("nosniff",);
    expect(res.headers.get("content-disposition",),).toBeNull();
  });

  test("private SVG: forced attachment (no inline script execution)", async () => {
    const res = await app.handle(new Request(`http://local/api/assets/${SVG_ID}/raw`,),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-disposition",),).toContain("attachment",);
    expect(res.headers.get("x-content-type-options",),).toBe("nosniff",);
  });

  test("private PNG download: attachment + private cache-control", async () => {
    const res = await app.handle(new Request(`http://local/api/assets/${PNG_ID}/download`,),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-disposition",),).toContain("attachment",);
    expect(res.headers.get("cache-control",),).toBe("private, max-age=3600",);
    expect(res.headers.get("x-content-type-options",),).toBe("nosniff",);
  });

  test("signed URL on private asset: private cache-control (no shared-cache replay)", async () => {
    const signed = await signAssetUrl({
      secret: POLICY_SECRET,
      assetId: PNG_ID,
      action: "raw",
      expiresInSeconds: 900,
    },);
    const url = new URL(`http://local/api/assets/${PNG_ID}/raw`,);
    url.searchParams.set("expires", String(signed.expiresAt,),);
    url.searchParams.set("sig", signed.token,);
    const res = await app.handle(new Request(url,),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("cache-control",),).toBe("private, max-age=3600",);
  });
});
