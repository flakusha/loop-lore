// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct unit coverage for the asset serve handlers.
 *
 * The route-level controller suite only reaches the public raw path, so these
 * tests call `resolveAsset`, `signedUrlAuth`, `handleServeRaw`,
 * `handleServeCompressed`, and `handleDownload` directly against a real
 * in-memory DB + real files on disk: signed-URL auth (valid/expired/bogus),
 * the encrypted-without-chat-context gate, compressed fallback + webp
 * variant, and download filename sanitization.
 *
 * Resource contract (parallel-safe): every test owns its own resources — a
 * fresh in-memory SQLite DB (`createTestDb`) and a fresh
 * `mkdtempSync(tmpdir(), "ll-serve-handlers-")` upload dir, both released by
 * `cleanup()` in `finally` so a failing test cannot leak them. No fixed paths,
 * no ports, and no shared mutable module state (`initSmk` is never called, so
 * `getSmk()` stays null and the encrypted-asset 400 branch is deterministic).
 * Each test passes standalone, in any order, and under concurrent file
 * execution.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import { AssetType, AssetVisibility, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { handleDownload, handleServeCompressed, handleServeRaw, resolveAsset, signedUrlAuth, } from "./serve-handlers";
import { createAsset, } from "./service";
import { signAssetUrl, } from "./signed-url";
import { makeMinimalPng, makeMinimalWebp, } from "./test-helpers";

const SECRET = "serve-handlers-test-hmac-secret-0123456789";

interface Fixture {
  db: Kysely<DB>;
  uploadDir: string;
  ownerId: string;
  outsiderId: string;
  assetId: string;
  filename: string;
  bytes: Buffer;
}

function makeConfig(uploadDir: string,): Config {
  const config = createConfigSchema().defaults as Config;
  config.assets.uploadDir = uploadDir;
  config.assets.signedUrlSecret = SECRET;
  return config;
}

async function seed(): Promise<Fixture> {
  const { db, } = await createTestDb();
  const uploadDir = mkdtempSync(join(tmpdir(), "ll-serve-handlers-",),);
  const ownerId = randomUUID();
  const outsiderId = randomUUID();
  await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
  await insertUsers(db, `out-${outsiderId}`, "Outsider", { id: outsiderId, } as never,);

  const bytes = makeMinimalPng(4, 3,);
  const { asset, } = await createAsset({
    database: db,
    input: {
      ownerId,
      filename: "sprite.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: bytes.length,
      buffer: bytes,
    },
    uploadDir,
  },);
  return {
    db,
    uploadDir,
    ownerId,
    outsiderId,
    assetId: asset.id,
    filename: asset.filename,
    bytes,
  };
}

/** Create a second asset (distinct content so idempotent-upload dedupe skips). */
async function addAsset(fx: Fixture, filename: string,): Promise<string> {
  const bytes = makeMinimalPng(7, 5,);
  const { asset, } = await createAsset({
    database: fx.db,
    input: {
      ownerId: fx.ownerId,
      filename,
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: bytes.length,
      buffer: bytes,
    },
    uploadDir: fx.uploadDir,
  },);
  return asset.id;
}

async function cleanup(fx: Fixture,) {
  await fx.db.destroy();
  rmSync(fx.uploadDir, { recursive: true, force: true, },);
}

describe("resolveAsset", () => {
  test("owner resolves their own asset", async () => {
    const fx = await seed();
    try {
      const resolved = await resolveAsset(fx.db, fx.assetId, fx.ownerId, "user",);
      if (resolved instanceof Response) { throw new Error("expected asset, got Response",); }
      expect(resolved.asset.id,).toBe(fx.assetId,);
      expect(resolved.asset.filename,).toBe(fx.filename,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("non-owner gets 404", async () => {
    const fx = await seed();
    try {
      const resolved = await resolveAsset(fx.db, fx.assetId, fx.outsiderId, "user",);
      if (!(resolved instanceof Response)) { throw new Error("expected 404 Response",); }
      expect(resolved.status,).toBe(404,);
      const body = (await resolved.json()) as { error: string };
      expect(body.error,).toBe("Not found",);
    } finally {
      await cleanup(fx,);
    }
  });

  test("missing asset id with an admin bypass gets 404", async () => {
    const fx = await seed();
    try {
      const resolved = await resolveAsset(fx.db, randomUUID(), fx.outsiderId, "admin",);
      if (!(resolved instanceof Response)) { throw new Error("expected 404 Response",); }
      expect(resolved.status,).toBe(404,);
      const body = (await resolved.json()) as { error: string };
      expect(body.error,).toBe("Asset not found",);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("signedUrlAuth", () => {
  test("no sig/expires params yields empty opts (session auth)", () => {
    const config = makeConfig("/tmp/ll-serve-handlers-unused",);
    expect(signedUrlAuth(new URLSearchParams(), "raw", config,),).toEqual({},);
  });

  test("sig+expires yields resolved signed-url opts", () => {
    const config = makeConfig("/tmp/ll-serve-handlers-unused",);
    const opts = signedUrlAuth(
      new URLSearchParams({ sig: "token-value", expires: "1700000000000", },),
      "thumb",
      config,
    );
    expect(opts.signedUrlToken,).toBe("token-value",);
    expect(opts.signedUrlExpires,).toBe(1_700_000_000_000,);
    expect(opts.signedUrlAction,).toBe("thumb",);
    expect(opts.signedUrlSecret,).toBe(SECRET,);
  });
});

describe("handleServeRaw", () => {
  test("public asset serves the original bytes and mime to a non-owner", async () => {
    const fx = await seed();
    try {
      await fx.db
        .updateTable("assets",)
        .set({ visibility: AssetVisibility.Public, },)
        .where("id", "=", fx.assetId,)
        .execute();
      const res = await handleServeRaw({
        database: fx.db,
        assetId: fx.assetId,
        uploadDir: fx.uploadDir,
        actorId: fx.outsiderId,
        actorRole: "user",
      },);
      expect(res.status,).toBe(200,);
      expect(res.headers.get("content-type",),).toBe("image/png",);
      expect(Buffer.compare(Buffer.from(await res.arrayBuffer(),), fx.bytes,),).toBe(0,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("encrypted asset without chat context returns 400", async () => {
    const fx = await seed();
    try {
      await fx.db
        .updateTable("assets",)
        .set({ encryption_tier: "chat", encrypted_key_id: "test-chat-key", },)
        .where("id", "=", fx.assetId,)
        .execute();
      const res = await handleServeRaw({
        database: fx.db,
        assetId: fx.assetId,
        uploadDir: fx.uploadDir,
        actorId: fx.ownerId,
        actorRole: "user",
      },);
      expect(res.status,).toBe(400,);
      expect(await res.text(),).toBe("Encrypted asset requires chat context",);
    } finally {
      await cleanup(fx,);
    }
  });

  test("valid signed URL replaces session auth (anonymous actor)", async () => {
    const fx = await seed();
    try {
      const { token, expiresAt, } = await signAssetUrl({ secret: SECRET, assetId: fx.assetId, action: "raw", },);
      const res = await handleServeRaw({
        database: fx.db,
        assetId: fx.assetId,
        uploadDir: fx.uploadDir,
        actorId: null,
        actorRole: null,
        signedUrlSecret: SECRET,
        signedUrlToken: token,
        signedUrlExpires: expiresAt,
        signedUrlAction: "raw",
      },);
      expect(res.status,).toBe(200,);
      expect(Buffer.compare(Buffer.from(await res.arrayBuffer(),), fx.bytes,),).toBe(0,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("token without a secret or action returns 403 Invalid signed URL", async () => {
    const fx = await seed();
    try {
      const res = await handleServeRaw({
        database: fx.db,
        assetId: fx.assetId,
        uploadDir: fx.uploadDir,
        actorId: null,
        actorRole: null,
        signedUrlToken: "orphan-token",
      },);
      expect(res.status,).toBe(403,);
      const body = (await res.json()) as { error: string; code: string };
      expect(body.error,).toBe("Invalid signed URL",);
      expect(body.code,).toBe("FORBIDDEN",);
    } finally {
      await cleanup(fx,);
    }
  });

  test("token without a finite expiry returns 403 Invalid signed URL", async () => {
    const fx = await seed();
    try {
      const res = await handleServeRaw({
        database: fx.db,
        assetId: fx.assetId,
        uploadDir: fx.uploadDir,
        actorId: null,
        actorRole: null,
        signedUrlSecret: SECRET,
        signedUrlToken: "token-without-expiry",
        signedUrlAction: "raw",
      },);
      expect(res.status,).toBe(403,);
      const body = (await res.json()) as { error: string };
      expect(body.error,).toBe("Invalid signed URL",);
    } finally {
      await cleanup(fx,);
    }
  });

  test("bogus token with a real secret returns 403 Invalid or expired signed URL", async () => {
    const fx = await seed();
    try {
      const res = await handleServeRaw({
        database: fx.db,
        assetId: fx.assetId,
        uploadDir: fx.uploadDir,
        actorId: null,
        actorRole: null,
        signedUrlSecret: SECRET,
        signedUrlToken: "bogus-token",
        signedUrlExpires: Date.now() + 60_000,
        signedUrlAction: "raw",
      },);
      expect(res.status,).toBe(403,);
      const body = (await res.json()) as { error: string };
      expect(body.error,).toBe("Invalid or expired signed URL",);
    } finally {
      await cleanup(fx,);
    }
  });

  test("expired-but-authentic token returns 403 Invalid or expired signed URL", async () => {
    const fx = await seed();
    try {
      const { token, expiresAt, } = await signAssetUrl({
        secret: SECRET,
        assetId: fx.assetId,
        action: "raw",
        expiresInSeconds: -60,
      },);
      const res = await handleServeRaw({
        database: fx.db,
        assetId: fx.assetId,
        uploadDir: fx.uploadDir,
        actorId: null,
        actorRole: null,
        signedUrlSecret: SECRET,
        signedUrlToken: token,
        signedUrlExpires: expiresAt,
        signedUrlAction: "raw",
      },);
      expect(res.status,).toBe(403,);
      const body = (await res.json()) as { error: string };
      expect(body.error,).toBe("Invalid or expired signed URL",);
    } finally {
      await cleanup(fx,);
    }
  });

  test("authentic token for an asset with no row returns 404", async () => {
    const fx = await seed();
    try {
      const ghostId = randomUUID();
      const { token, expiresAt, } = await signAssetUrl({ secret: SECRET, assetId: ghostId, action: "raw", },);
      const res = await handleServeRaw({
        database: fx.db,
        assetId: ghostId,
        uploadDir: fx.uploadDir,
        actorId: null,
        actorRole: null,
        signedUrlSecret: SECRET,
        signedUrlToken: token,
        signedUrlExpires: expiresAt,
        signedUrlAction: "raw",
      },);
      expect(res.status,).toBe(404,);
      const body = (await res.json()) as { error: string };
      expect(body.error,).toBe("Asset not found",);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("handleServeCompressed", () => {
  test("falls back to the raw bytes when no compressed variant exists", async () => {
    const fx = await seed();
    try {
      const res = await handleServeCompressed({
        database: fx.db,
        assetId: fx.assetId,
        uploadDir: fx.uploadDir,
        variant: "thumb",
        actorId: fx.ownerId,
        actorRole: "user",
      },);
      expect(res.status,).toBe(200,);
      expect(res.headers.get("content-type",),).toBe("image/png",);
      expect(Buffer.compare(Buffer.from(await res.arrayBuffer(),), fx.bytes,),).toBe(0,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("serves the on-disk webp variant when present", async () => {
    const fx = await seed();
    try {
      const webp = makeMinimalWebp(8, 6,);
      const subDir = `${fx.assetId.slice(0, 2,)}/${fx.assetId.slice(2, 4,)}`;
      mkdirSync(join(fx.uploadDir, "compressed", subDir,), { recursive: true, },);
      writeFileSync(join(fx.uploadDir, "compressed", subDir, `${fx.assetId}_thumb.webp`,), webp,);

      const res = await handleServeCompressed({
        database: fx.db,
        assetId: fx.assetId,
        uploadDir: fx.uploadDir,
        variant: "thumb",
        actorId: fx.ownerId,
        actorRole: "user",
      },);
      expect(res.status,).toBe(200,);
      expect(res.headers.get("content-type",),).toBe("image/webp",);
      expect(Buffer.compare(Buffer.from(await res.arrayBuffer(),), webp,),).toBe(0,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("non-owner of a private asset gets 404 (no bytes leak)", async () => {
    const fx = await seed();
    try {
      const res = await handleServeCompressed({
        database: fx.db,
        assetId: fx.assetId,
        uploadDir: fx.uploadDir,
        variant: "thumb",
        actorId: fx.outsiderId,
        actorRole: "user",
      },);
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("handleDownload", () => {
  test("attaches the original filename and bytes", async () => {
    const fx = await seed();
    try {
      const res = await handleDownload({
        database: fx.db,
        assetId: fx.assetId,
        uploadDir: fx.uploadDir,
        actorId: fx.ownerId,
        actorRole: "user",
      },);
      expect(res.status,).toBe(200,);
      expect(res.headers.get("content-disposition",),).toBe(`attachment; filename="${fx.filename}"`,);
      expect(Buffer.compare(Buffer.from(await res.arrayBuffer(),), fx.bytes,),).toBe(0,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("sanitizes illegal characters and spaces in the filename", async () => {
    const fx = await seed();
    try {
      const messyName = "my photo (1).png";
      const messyId = await addAsset(fx, messyName,);
      const res = await handleDownload({
        database: fx.db,
        assetId: messyId,
        uploadDir: fx.uploadDir,
        actorId: fx.ownerId,
        actorRole: "user",
      },);
      expect(res.status,).toBe(200,);
      expect(res.headers.get("content-disposition",),).toBe(
        `attachment; filename="my_photo_1_.png"`,
      );
    } finally {
      await cleanup(fx,);
    }
  });

  test("encrypted asset without chat context returns 400", async () => {
    const fx = await seed();
    try {
      await fx.db
        .updateTable("assets",)
        .set({ encryption_tier: "chat", encrypted_key_id: "test-chat-key", },)
        .where("id", "=", fx.assetId,)
        .execute();
      const res = await handleDownload({
        database: fx.db,
        assetId: fx.assetId,
        uploadDir: fx.uploadDir,
        actorId: fx.ownerId,
        actorRole: "user",
      },);
      expect(res.status,).toBe(400,);
      expect(await res.text(),).toBe("Encrypted asset requires chat context",);
    } finally {
      await cleanup(fx,);
    }
  });
});
