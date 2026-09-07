// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/controller/handlers.ts — all route handlers called
 * directly with a synthetic Elysia-style RouteCtx.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Config } from "../../config/schema";
import type { DB } from "../../db/schema";
import type { Kysely } from "kysely";
import { createTestDb } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers } from "../../test-utils/insert-helpers";
import {
  handleCreateLink,
  handleCreateShare,
  handleDeleteAsset,
  handleDeleteLink,
  handleDeleteShare,
  handleGetAsset,
  handleListAssets,
  handleListLinks,
  handleListShares,
  handlePatchAsset,
} from "./handlers";
import type { RouteCtx } from "./types";

const OWNER = "handler-owner";
const PEER = "handler-peer";
const ASSET_ID = "e1a2b3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const SHARED_ASSET = "e2a2b3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const UPLOAD_DIR = join(tmpdir(), "ll-handler-test");

let db: Kysely<DB>;
let ownerId: string;
let peerId: string;
let config: Config;

beforeAll(async () => {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const { db: theDb } = await createTestDb();
  db = theDb;
  await insertUsers(db, OWNER, "Handler Owner");
  await insertUsers(db, PEER, "Handler Peer");
  const users = await db.selectFrom("users").select(["id", "username"]).execute();
  ownerId = users.find((u) => u.username === OWNER)!.id;
  peerId = users.find((u) => u.username === PEER)!.id;
  await db.insertInto("actors").values({ id: ownerId, display_name: "Owner Actor" }).execute();
  await db.insertInto("actors").values({ id: peerId, display_name: "Peer Actor" }).execute();
  await insertAssets(db, ownerId, "asset.png", "image/png", "image" as never, 8,
    `raw/e1/a2/${ASSET_ID}.png`,
    { id: ASSET_ID as never });
  await insertAssets(db, ownerId, "shared.png", "image/png", "image" as never, 8,
    `raw/e2/a2/${SHARED_ASSET}.png`,
    { id: SHARED_ASSET as never, visibility: "shared" as never });
  config = {
    assets: { uploadDir: UPLOAD_DIR, enabled: true, maxFileSize: 10_485_760, compression: true, signedUrlSecret: "", signedUrlExpirySeconds: 900 },
    auth: { jwtSecret: "test" },
  } as unknown as Config;
});

afterAll(() => {
  db?.destroy();
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

function ctx(params: Record<string, string> = {}, body: unknown = undefined, userId: string | null = ownerId): RouteCtx {
  return {
    request: new Request("http://local/api/assets"),
    params,
    body,
    userId,
    userRole: userId === ownerId ? "user" : "user",
  };
}

describe("handleListAssets", () => {
  test("returns 200 for an authenticated user", async () => {
    const res = await handleListAssets({ database: db, config, ctx: ctx() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("returns 200 for an anonymous user", async () => {
    const res = await handleListAssets({ database: db, config, ctx: ctx({}, undefined, null) });
    expect(res.status).toBe(200);
  });
});

describe("handleGetAsset", () => {
  test("returns 200 for an existing asset", async () => {
    const res = await handleGetAsset({ database: db, config, ctx: ctx({ id: ASSET_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(ASSET_ID);
  });

  test("returns 404 for a missing asset", async () => {
    const res = await handleGetAsset({ database: db, config, ctx: ctx({ id: "ghost" }) });
    expect(res.status).toBe(404);
  });
});

describe("handlePatchAsset", () => {
  test("returns 401 when no user is present", async () => {
    const res = await handlePatchAsset({ database: db, config, ctx: ctx({ id: ASSET_ID }, { visibility: "public" }, null) });
    expect(res.status).toBe(401);
  });

  test("returns 400 for an invalid visibility value", async () => {
    const res = await handlePatchAsset({ database: db, config, ctx: ctx({ id: ASSET_ID }, { visibility: "deleted" }) });
    expect(res.status).toBe(400);
  });

  test("returns 404 when non-owner tries to patch", async () => {
    const res = await handlePatchAsset({ database: db, config, ctx: ctx({ id: ASSET_ID }, { visibility: "public" }, peerId) });
    expect(res.status).toBe(404);
  });

  test("owner can change visibility to public", async () => {
    const res = await handlePatchAsset({ database: db, config, ctx: ctx({ id: ASSET_ID }, { visibility: "public" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.visibility).toBe("public");
  });

  test("owner can change visibility to shared", async () => {
    const res = await handlePatchAsset({ database: db, config, ctx: ctx({ id: ASSET_ID }, { visibility: "shared" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.visibility).toBe("shared");
  });
});

describe("handleDeleteAsset", () => {
  let deletableId: string;

  beforeAll(async () => {
    deletableId = "f1a2b3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    await insertAssets(db, ownerId, "todel.png", "image/png", "image" as never, 8,
      `raw/f1/a2/${deletableId}.png`,
      { id: deletableId as never });
  });

  test("returns 401 when no user is present", async () => {
    const res = await handleDeleteAsset({ database: db, config, ctx: ctx({ id: deletableId }, undefined, null) });
    expect(res.status).toBe(401);
  });

  test("returns 404 when non-owner tries to delete", async () => {
    const res = await handleDeleteAsset({ database: db, config, ctx: ctx({ id: deletableId }, undefined, peerId) });
    expect(res.status).toBe(404);
  });

  test("owner can delete an existing asset and it is gone afterwards", async () => {
    const res = await handleDeleteAsset({ database: db, config, ctx: ctx({ id: deletableId }) });
    expect(res.status).toBe(204);
    const getRes = await handleGetAsset({ database: db, config, ctx: ctx({ id: deletableId }) });
    expect(getRes.status).toBe(404);
  });
});

describe("handleListLinks", () => {
  test("returns an empty array for an asset with no links", async () => {
    const res = await handleListLinks({ database: db, config, ctx: ctx({ id: ASSET_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

describe("handleCreateLink", () => {
  test("owner can create a link with a label", async () => {
    const res = await handleCreateLink({
      database: db, config,
      ctx: ctx({ id: ASSET_ID }, { entityType: "character", entityId: "char-link-1", label: "avatar" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(ASSET_ID);
  });
});

describe("handleDeleteLink", () => {
  test("rejects when entityType or entityId is missing", async () => {
    const res = await handleDeleteLink({
      database: db, config,
      ctx: ctx({ id: ASSET_ID }, { entityType: "character" }),
    });
    expect(res.status).toBe(400);
  });

  test("owner can delete a link", async () => {
    const res = await handleDeleteLink({
      database: db, config,
      ctx: ctx({ id: ASSET_ID }, { entityType: "character", entityId: "char-link-1" }),
    });
    expect(res.status).toBe(204);
  });
});

describe("handleCreateShare", () => {
  test("rejects when actor_id is missing", async () => {
    const res = await handleCreateShare({
      database: db, config,
      ctx: ctx({ id: ASSET_ID }, {}),
    });
    expect(res.status).toBe(400);
  });

  test("owner can create a share", async () => {
    const res = await handleCreateShare({
      database: db, config,
      ctx: ctx({ id: SHARED_ASSET }, { actor_id: peerId }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.asset_id).toBe(SHARED_ASSET);
  });
});

describe("handleDeleteShare", () => {
  test("rejects when actor_id is missing", async () => {
    const res = await handleDeleteShare({
      database: db, config,
      ctx: ctx({ id: SHARED_ASSET }, {}),
    });
    expect(res.status).toBe(400);
  });

  test("owner can delete a share", async () => {
    const res = await handleDeleteShare({
      database: db, config,
      ctx: ctx({ id: SHARED_ASSET }, { actor_id: peerId }),
    });
    expect(res.status).toBe(204);
  });
});

describe("handleListShares", () => {
  test("owner can list shares", async () => {
    await handleCreateShare({ database: db, config, ctx: ctx({ id: SHARED_ASSET }, { actor_id: peerId }) });
    const res = await handleListShares({ database: db, config, ctx: ctx({ id: SHARED_ASSET }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
