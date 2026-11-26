// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/assets.test.ts — the assets facade
// ops over a :memory: database.
//
// Covers the slice's acceptance surfaces end-to-end through runFacadeOp:
//  - a permitted principal kind succeeds and returns the expected shape;
//  - another user's private asset is neither listed nor fetchable (the
//    cross-actor proof);
//  - the payload is metadata only — no bytes, no storage path, no encryption
//    key id;
//  - a principal kind the domain does not admit is refused with the
//    facade's own 403 `forbidden` shape;
//  - every call leaves exactly one audit row behind.
//
// Resource contract (parallel-safe): one :memory: SQLite per test via
// createTestDb, no ports, no env, no sleeps.

import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import { AssetType, AssetVisibility, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { principalKind, type PrincipalKindLiteral, } from "../../../middleware/principal-kind";
import { createRequestContext, } from "../../../middleware/types";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertAssets,
  insertAssetShares,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { createFacadeRegistry, type FacadeRegistry, runFacadeOp, } from "../registry";
import type { FacadeContext, } from "../types";
import { facadeContextFromRequestContext, } from "../types";
import {
  AssetMetadataOutputSchema,
  AssetsGetBody,
  AssetsListBody,
  AssetsListOutputSchema,
  registerAssetsOps,
} from "./assets";

const USER = "facade-assets-user";
const OTHER = "facade-assets-other";
const OTHER_ACTOR = "facade-assets-other-actor";

let testDb: TestDb;
let db: Kysely<DB>;
const config = {} as Config;

beforeAll(() => {
  createLogger({ level: "error", },);
},);

beforeEach(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  await insertUsers(db, USER, "Facade Assets User", { id: USER, },);
  await insertUsers(db, OTHER, "Facade Assets Other", { id: OTHER, },);
},);

afterEach(async () => {
  await destroyTestDb(testDb,);
},);

function buildRegistry(): FacadeRegistry {
  const registry = createFacadeRegistry();
  registerAssetsOps(registry, { database: db, config, },);
  return registry;
}

function ctxFor(userId: string, kind: PrincipalKindLiteral = "user",): FacadeContext {
  const rc = createRequestContext({
    userId,
    userRole: "user",
    sessionId: null,
    principalKind: principalKind(kind,),
    credentialId: kind === "external-agent" ? "facade-assets-cred" : null,
    credentialName: kind === "external-agent" ? "facade-assets-token" : null,
    credentialScope: kind === "external-agent" ? "read" : null,
  },);

  return facadeContextFromRequestContext({ ...rc, requestId: "req-facade-assets", }, db, config,);
}

async function seedAssets(): Promise<{
  own: string;
  otherPrivate: string;
  otherPublic: string;
  shared: string;
}> {
  // The repo's convention: the user's own actor row carries the user's id, so
  // an asset shared with that actor is shared with the user.
  await insertActors(db, "Facade Assets User", { id: USER, actor_type: "user", user_id: USER, owner_id: USER, },);
  await insertActors(db, "Facade Assets Other", {
    id: OTHER_ACTOR,
    actor_type: "user",
    user_id: OTHER,
    owner_id: OTHER,
  },);

  const own = await insertAssets(db, USER, "own.png", "image/png", AssetType.Image, 1024, "/vault/own.png", {
    visibility: AssetVisibility.Private,
    encrypted_key_id: "key-own",
  },);

  const otherPrivate = await insertAssets(
    db,
    OTHER,
    "other.png",
    "image/png",
    AssetType.Image,
    2048,
    "/vault/other.png",
    { visibility: AssetVisibility.Private, },
  );

  const otherPublic = await insertAssets(
    db,
    OTHER,
    "public.png",
    "image/png",
    AssetType.Image,
    256,
    "/vault/public.png",
    { visibility: AssetVisibility.Public, },
  );

  const shared = await insertAssets(
    db,
    OTHER,
    "shared.png",
    "image/png",
    AssetType.Image,
    512,
    "/vault/shared.png",
    { visibility: AssetVisibility.Shared, },
  );

  await insertAssetShares(db, shared, USER, OTHER_ACTOR,);

  return { own, otherPrivate, otherPublic, shared, };
}

describe("facade assets ops", () => {
  test("assets.list returns the caller's own asset and the public one, never another user's private asset", async () => {
    const assets = await seedAssets();

    const result = await runFacadeOp(buildRegistry(), ctxFor(USER,), "assets.list", {},);

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);

    const json = result.json as { data: { id: string }[]; total: number };
    const ids = json.data.map((row,) => row.id);
    expect(ids,).toContain(assets.own,);
    expect(ids,).toContain(assets.otherPublic,);
    expect(ids,).toContain(assets.shared,);
    expect(ids,).not.toContain(assets.otherPrivate,);
    expect(json.total,).toBe(3,);
  });

  test("a malformed body is refused with the facade's own 400 shape", async () => {
    const registry = buildRegistry();

    const listed = await runFacadeOp(registry, ctxFor(USER,), "assets.list", { page: "many", },);
    expect(listed.ok,).toBe(false,);
    expect(listed.status,).toBe(400,);
    expect((listed.json as { error: string }).error,).toBe("bad_request",);

    const fetched = await runFacadeOp(registry, ctxFor(USER,), "assets.get", {},);
    expect(fetched.ok,).toBe(false,);
    expect(fetched.status,).toBe(400,);
    expect((fetched.json as { error: string }).error,).toBe("bad_request",);
  });

  test("assets.get honours the repo's share ACL — a shared asset is readable", async () => {
    const assets = await seedAssets();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "assets.get",
      { assetId: assets.shared, },
    );

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);
    expect((result.json as { filename: string }).filename,).toBe("shared.png",);
  });

  test("assets.get returns metadata only — no bytes, no storage path, no encryption key id", async () => {
    const assets = await seedAssets();

    const result = await runFacadeOp(buildRegistry(), ctxFor(USER,), "assets.get", { assetId: assets.own, },);

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);

    const json = result.json as Record<string, unknown>;
    expect(json.id,).toBe(assets.own,);
    expect(json.filename,).toBe("own.png",);
    expect(json.mimeType,).toBe("image/png",);
    expect(json.assetType,).toBe("image",);
    expect(json.sizeBytes,).toBe(1024,);
    expect(json.storage_path,).toBeUndefined();
    expect(json.storagePath,).toBeUndefined();
    expect(json.encrypted_key_id,).toBeUndefined();

    const serialized = JSON.stringify(result.json,);
    expect(serialized,).not.toContain("/vault/own.png",);
    expect(serialized,).not.toContain("key-own",);
  });

  test("assets.get hides another user's private asset behind a 404", async () => {
    const assets = await seedAssets();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "assets.get",
      { assetId: assets.otherPrivate, },
    );

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(404,);
    expect((result.json as { error: string }).error,).toBe("not_found",);
    expect(JSON.stringify(result.json,),).not.toContain("other.png",);
  });

  test("the assets domain refuses a principal kind it does not admit", async () => {
    await seedAssets();

    const result = await runFacadeOp(buildRegistry(), ctxFor(USER, "user-worktree",), "assets.list", {},);

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(403,);
    expect((result.json as { error: string }).error,).toBe("forbidden",);
  });

  test("the assets domain admits the external-agent principal kind with a read tier", async () => {
    const assets = await seedAssets();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER, "external-agent",),
      "assets.get",
      { assetId: assets.own, },
    );

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);
  });

  test("every assets call writes one audit row through the shared audit path", async () => {
    await seedAssets();

    await runFacadeOp(buildRegistry(), ctxFor(USER,), "assets.list", {},);

    const rows = await db
      .selectFrom("log_entries",)
      .selectAll()
      .where("event_type", "=", "facade.op",)
      .execute();

    expect(rows.length,).toBe(1,);
    expect(rows[0]?.action,).toBe("assets.list",);
    expect(rows[0]?.user_id,).toBe(USER,);
    expect(rows[0]?.module,).toBe("loop-lore-facade",);
  });

  test("assets.list declares honest annotations - read-only, never idempotent", () => {
    const annotations = buildRegistry().resolve("assets.list",)?.annotations;
    expect(annotations?.readOnlyHint,).toBe(true,);
    expect(annotations?.idempotentHint,).toBeUndefined();
  });

  test("assets.get declares honest annotations - read-only, never idempotent", () => {
    const annotations = buildRegistry().resolve("assets.get",)?.annotations;
    expect(annotations?.readOnlyHint,).toBe(true,);
    expect(annotations?.idempotentHint,).toBeUndefined();
  });

  test("the assets ops carry the schemas a manifest generator needs", () => {
    const registry = buildRegistry();

    const list = registry.resolve("assets.list",);
    expect(list?.bodySchema,).toBe(AssetsListBody,);
    expect(list?.outputSchema,).toBe(AssetsListOutputSchema,);
    expect(list?.annotations?.readOnlyHint,).toBe(true,);

    const get = registry.resolve("assets.get",);
    expect(get?.bodySchema,).toBe(AssetsGetBody,);
    expect(get?.outputSchema,).toBe(AssetMetadataOutputSchema,);
  });
});
