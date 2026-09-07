// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/controller/serve.ts — signed-URL reject paths and
 * compressed-variant fallback not covered by the existing routes suite.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb, type TestDb } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers } from "../../test-utils/insert-helpers";
import { handleDownload, handleServeCompressed, handleServeRaw } from "./serve";
import { signAssetUrl } from "./signed-url";

const SECRET = "serve-extra-secret";
const ASSET_ID = "s1a2b3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const DELETED_ASSET_ID = "d0000000-0000-0000-0000-000000000001";
const UPLOAD_DIR = join(tmpdir(), "ll-serve-extra");

let db: TestDb;
let ownerId: string;

beforeAll(async () => {
  db = await createTestDb();
  mkdirSync(UPLOAD_DIR, { recursive: true });
  await insertUsers(db.db, "serve-owner", "Serve Owner");
  const userRow = await db.db.selectFrom("users").select("id").where("username", "=", "serve-owner").executeTakeFirstOrThrow();
  ownerId = userRow.id;
  // Persisted asset used by compressed and download tests
  await insertAssets(db.db, ownerId, "serve.png", "image/png", "image" as never, 8,
    `raw/s1/a2/${ASSET_ID}.png`,
    { id: ASSET_ID as never, visibility: "public" as never });
  const fileDir = join(UPLOAD_DIR, "raw", "s1", "a2");
  mkdirSync(fileDir, { recursive: true });
  writeFileSync(join(fileDir, `${ASSET_ID}.png`), "PNGDATA");
  // Ephemeral asset used only by the "token valid but asset deleted" test
  await insertAssets(db.db, ownerId, "deleted.png", "image/png", "image" as never, 8,
    `raw/d0/00/deleted.png`,
    { id: DELETED_ASSET_ID as never, visibility: "public" as never });
});

afterAll(() => {
  db.sqlite.close();
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe("handleServeRaw — signed URL reject paths", () => {
  test("returns 403 when a token is present but no secret is configured", async () => {
    const res = await handleServeRaw({
      database: db.db,
      assetId: ASSET_ID,
      uploadDir: UPLOAD_DIR,
      actorId: null,
      actorRole: null,
      signedUrlSecret: null,
      signedUrlToken: "some-token",
      signedUrlExpires: Date.now() + 900_000,
      signedUrlAction: "raw",
    });
    expect(res.status).toBe(403);
  });

  test("returns 403 when token is present but action is missing", async () => {
    const res = await handleServeRaw({
      database: db.db,
      assetId: ASSET_ID,
      uploadDir: UPLOAD_DIR,
      actorId: null,
      actorRole: null,
      signedUrlSecret: SECRET,
      signedUrlToken: "some-token",
      signedUrlExpires: Date.now() + 900_000,
      signedUrlAction: null,
    });
    expect(res.status).toBe(403);
  });

  test("returns 403 when token is present but expires is non-finite", async () => {
    const res = await handleServeRaw({
      database: db.db,
      assetId: ASSET_ID,
      uploadDir: UPLOAD_DIR,
      actorId: null,
      actorRole: null,
      signedUrlSecret: SECRET,
      signedUrlToken: "some-token",
      signedUrlExpires: null,
      signedUrlAction: "raw",
    });
    expect(res.status).toBe(403);
  });

  test("returns 404 when token is valid but the asset no longer exists", async () => {
    const signed = await signAssetUrl({
      secret: SECRET,
      assetId: DELETED_ASSET_ID,
      action: "raw",
      expiresInSeconds: 900,
    });
    await db.db.deleteFrom("assets").where("id", "=", DELETED_ASSET_ID).execute();
    const res = await handleServeRaw({
      database: db.db,
      assetId: DELETED_ASSET_ID,
      uploadDir: UPLOAD_DIR,
      actorId: null,
      actorRole: null,
      signedUrlSecret: SECRET,
      signedUrlToken: signed.token,
      signedUrlExpires: signed.expiresAt,
      signedUrlAction: "raw",
    });
    expect(res.status).toBe(404);
  });
});

describe("handleServeCompressed — fallback to raw", () => {
  test("serves the raw file when no compressed variant exists", async () => {
    const res = await handleServeCompressed({
      database: db.db,
      assetId: ASSET_ID,
      uploadDir: UPLOAD_DIR,
      variant: "thumb",
      actorId: ownerId,
      actorRole: null,
    });
    expect(res.status).toBe(200);
  });
});

describe("handleDownload — plain asset", () => {
  test("serves the file with attachment disposition", async () => {
    const res = await handleDownload({
      database: db.db,
      assetId: ASSET_ID,
      uploadDir: UPLOAD_DIR,
      actorId: ownerId,
      actorRole: null,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
  });
});
