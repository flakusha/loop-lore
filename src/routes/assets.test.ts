// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the asset batch surface (gallery batch §7.7):
 * POST /api/assets/batch-download (server-side zip) and
 * POST /api/assets/batch-delete.
 *
 * Pins the trust boundary on both endpoints: 401 anonymous, silent omission
 * of inaccessible ids (no existence oracle), NSFW rating visibility, the
 * assets-disabled guard, and the empty-selection validation error.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import JSZip from "jszip";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { initAgeGate, } from "../age-gate/controller";
import { createAsset, } from "../assets/service";
import { makeMinimalPng, } from "../assets/test-helpers";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import { AgeGateMode, AssetLinkEntity, AssetType, AssetVisibility, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertAssetLinks,
  insertAssets,
  insertUsers,
} from "../test-utils/insert-helpers";
import { assetsRoutes, zipEntryName, } from "./assets";

// Resource contract: the NSFW age verdict delegates to the process-global
// ageGate.* runtime singleton (BUG-two-gates-age-gate-keys), and with the
// default-off every caller passes the NSFW gate. This file therefore owns that
// singleton for its own duration — enabled here, restored to the disabled
// state in `afterAll` so the file passes alone, in any order, and leaves no
// global behind. Disabled + "none" is observably identical to the store's
// initial value (`isEnabled = enabled && mode !== "none"`).
beforeAll(() => {
  initAgeGate({ enabled: true, minimumAge: 18, mode: AgeGateMode.SelfDeclaration, },);
},);

afterAll(() => {
  initAgeGate({ enabled: false, minimumAge: 18, mode: AgeGateMode.None, },);
},);

interface Fixture {
  db: Kysely<DB>;
  uploadDir: string;
  ownerId: string;
  strangerId: string;
  /** User past the age gate — birth date + acceptance pass canAccessNsfw. */
  clearedUserId: string;
}

/** App under test with the derive-injected identity the real app provides. */
function makeApp(
  fx: Fixture,
  userId: string | null,
  opts?: { userRole?: string; mutate?: (c: Config,) => void },
) {
  const config = createConfigSchema().defaults as Config;
  config.assets.uploadDir = fx.uploadDir;
  opts?.mutate?.(config,);
  return new Elysia()
    .derive(() => ({ userId, userRole: opts?.userRole ?? "user", }))
    .use(assetsRoutes({ database: fx.db, config, },),);
}

function post(app: ReturnType<typeof makeApp>, path: string, body: unknown,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

async function seed(): Promise<Fixture> {
  const { db, } = await createTestDb();
  const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-assets-batch-test-",),);
  const ownerId = randomUUID();
  const strangerId = randomUUID();
  const clearedUserId = randomUUID();
  await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
  await insertUsers(db, `str-${strangerId}`, "Stranger", { id: strangerId, } as never,);
  await insertUsers(db, `clear-${clearedUserId}`, "Cleared", {
    id: clearedUserId,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2020-06-01T00:00:00.000Z",
  } as never,);

  return { db, uploadDir, ownerId, strangerId, clearedUserId, };
}

async function cleanup(fx: Fixture,): Promise<void> {
  await fx.db.destroy();
  rmSync(fx.uploadDir, { recursive: true, force: true, },);
}

/** Create a real PNG asset on disk and return its id plus raw bytes. */
async function createPngAsset(
  fx: Fixture,
  ownerId: string,
  filename: string,
  width = 4,
): Promise<{ id: string; buffer: Uint8Array }> {
  const buffer = makeMinimalPng(width, 3,);
  const { asset, } = await createAsset({
    database: fx.db,
    input: {
      ownerId,
      filename,
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
      // Distinct rows per fixture: identical bytes under one owner would
      // content-dedupe onto a single id and collapse the batch under test.
      dedupe: false,
    },
    uploadDir: fx.uploadDir,
  },);

  return { id: asset.id, buffer, };
}

/** Create a PNG asset linked to an NSFW-rated actor (the v1 rating signal). */
async function createNsfwFlaggedAsset(fx: Fixture, ownerId: string, filename: string,): Promise<string> {
  const { id: assetId, } = await createPngAsset(fx, ownerId, filename,);
  const actorId = await insertActors(fx.db, "Nsfw Actor", { content_rating: "nsfw_moderate", },);
  await insertAssetLinks(fx.db, assetId, AssetLinkEntity.Actor, actorId,);
  return assetId;
}

/** Decode a zip response into name → bytes. */
async function zipEntries(res: Response,): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(new Uint8Array(await res.arrayBuffer(),),);
  const entries = new Map<string, Uint8Array>();
  for (const [name, file,] of Object.entries(zip.files,)) {
    if (!file.dir) { entries.set(name, await file.async("uint8array",),); }
  }

  return entries;
}

function bytesEqual(a: Uint8Array, b: Uint8Array,): boolean {
  return a.length === b.length && a.every((v, i,) => v === b[i]);
}

describe("zipEntryName", () => {
  test("sanitizes unsafe characters", () => {
    const taken = new Map<string, number>();
    expect(zipEntryName("my photo (1).png", taken,),).toBe("my_photo_1_.png",);
  });

  test("suffixes duplicate names keeping the extension", () => {
    const taken = new Map<string, number>();
    expect(zipEntryName("dup.png", taken,),).toBe("dup.png",);
    expect(zipEntryName("dup.png", taken,),).toBe("dup-2.png",);
    expect(zipEntryName("dup.png", taken,),).toBe("dup-3.png",);
  });

  test("falls back to a placeholder for empty names", () => {
    const taken = new Map<string, number>();
    expect(zipEntryName("", taken,),).toBe("asset",);
  });
});

describe("POST /api/assets/batch-download", () => {
  test("401 for anonymous callers", async () => {
    const fx = await seed();
    try {
      const res = await post(makeApp(fx, null,), "/api/assets/batch-download", { ids: [randomUUID(),], },);
      expect(res.status,).toBe(401,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("zips the selected assets with attachment headers", async () => {
    const fx = await seed();
    try {
      const { id: a, buffer: alphaBytes, } = await createPngAsset(fx, fx.ownerId, "alpha.png",);
      const { id: b, buffer: betaBytes, } = await createPngAsset(fx, fx.ownerId, "beta.png",);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", { ids: [a, b,], },);
      expect(res.status,).toBe(200,);
      expect(res.headers.get("content-type",),).toBe("application/zip",);
      expect(res.headers.get("content-disposition",),).toContain("attachment;",);
      expect(res.headers.get("content-disposition",),).toContain(".zip",);

      const entries = await zipEntries(res,);
      expect([...entries.keys(),].sort(),).toEqual(["alpha.png", "beta.png",],);
      expect(bytesEqual(entries.get("alpha.png",) ?? new Uint8Array(), alphaBytes,),).toBe(true,);
      expect(bytesEqual(entries.get("beta.png",) ?? new Uint8Array(), betaBytes,),).toBe(true,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("duplicate filenames become distinct zip entries", async () => {
    const fx = await seed();
    try {
      const { id: a, } = await createPngAsset(fx, fx.ownerId, "same.png", 4,);
      const { id: b, } = await createPngAsset(fx, fx.ownerId, "same.png", 5,);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", { ids: [a, b,], },);
      expect(res.status,).toBe(200,);
      const entries = await zipEntries(res,);
      expect([...entries.keys(),].sort(),).toEqual(["same-2.png", "same.png",],);
    } finally {
      await cleanup(fx,);
    }
  });

  test("mixed ownership: silently omits foreign and unknown ids", async () => {
    const fx = await seed();
    try {
      const { id: mine, } = await createPngAsset(fx, fx.strangerId, "mine.png",);
      const { id: foreign, } = await createPngAsset(fx, fx.ownerId, "foreign.png",);

      const res = await post(makeApp(fx, fx.strangerId,), "/api/assets/batch-download", {
        ids: [mine, foreign, randomUUID(),],
      },);

      expect(res.status,).toBe(200,);
      const entries = await zipEntries(res,);
      expect([...entries.keys(),],).toEqual(["mine.png",],);
    } finally {
      await cleanup(fx,);
    }
  });

  test("404 when nothing in the selection is downloadable", async () => {
    const fx = await seed();
    try {
      await createPngAsset(fx, fx.ownerId, "private.png",);
      const res = await post(makeApp(fx, fx.strangerId,), "/api/assets/batch-download", {
        ids: [randomUUID(),],
      },);

      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("skips assets whose file is missing on disk", async () => {
    const fx = await seed();
    try {
      const { id: present, } = await createPngAsset(fx, fx.ownerId, "present.png",);
      const ghost = await insertAssets(fx.db, fx.ownerId, "ghost.png", "image/png", AssetType.Image, 10, "ghost.png", {
        id: randomUUID(),
        visibility: AssetVisibility.Private,
      },);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", { ids: [present, ghost,], },);
      expect(res.status,).toBe(200,);
      const entries = await zipEntries(res,);
      expect([...entries.keys(),],).toEqual(["present.png",],);
    } finally {
      await cleanup(fx,);
    }
  });

  test("skips chat-encrypted assets even when the file exists", async () => {
    const fx = await seed();
    try {
      const { id: present, } = await createPngAsset(fx, fx.ownerId, "present.png",);
      const encryptedId = randomUUID();
      writeFileSync(join(fx.uploadDir, "enc.png",), makeMinimalPng(4, 3,),);
      await insertAssets(fx.db, fx.ownerId, "enc.png", "image/png", AssetType.Image, 10, "enc.png", {
        id: encryptedId,
        encryption_tier: "chat",
        encrypted_key_id: "key-1",
      },);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", {
        ids: [present, encryptedId,],
      },);

      expect(res.status,).toBe(200,);
      const entries = await zipEntries(res,);
      expect([...entries.keys(),],).toEqual(["present.png",],);
    } finally {
      await cleanup(fx,);
    }
  });

  test("omits NSFW-flagged assets for callers who fail the NSFW gate", async () => {
    const fx = await seed();
    try {
      const { id: safe, } = await createPngAsset(fx, fx.ownerId, "safe.png",);
      const nsfw = await createNsfwFlaggedAsset(fx, fx.ownerId, "nsfw.png",);

      // No birth_date and no acceptance → the enabled age gate denies.
      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", { ids: [safe, nsfw,], },);
      expect(res.status,).toBe(200,);
      const entries = await zipEntries(res,);
      expect([...entries.keys(),],).toEqual(["safe.png",],);
    } finally {
      await cleanup(fx,);
    }
  });

  test("includes NSFW-flagged assets for NSFW-cleared callers", async () => {
    const fx = await seed();
    try {
      // Owned by the cleared caller: ownership grants access, the gate alone
      // decides NSFW visibility — a stranger-owned row would be silently
      // skipped as inaccessible and mask the NSFW path.
      const nsfw = await createNsfwFlaggedAsset(fx, fx.clearedUserId, "nsfw.png",);

      const res = await post(makeApp(fx, fx.clearedUserId,), "/api/assets/batch-download", { ids: [nsfw,], },);
      expect(res.status,).toBe(200,);
      const entries = await zipEntries(res,);
      expect([...entries.keys(),],).toEqual(["nsfw.png",],);
    } finally {
      await cleanup(fx,);
    }
  });

  test("403 when the whole selection is NSFW-restricted for the caller", async () => {
    const fx = await seed();
    try {
      const nsfw = await createNsfwFlaggedAsset(fx, fx.ownerId, "nsfw.png",);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", { ids: [nsfw,], },);
      expect(res.status,).toBe(403,);
      const body = await res.json() as { error: string };
      expect(body.error,).toContain("NSFW",);
    } finally {
      await cleanup(fx,);
    }
  });

  test("404 when the asset system is disabled", async () => {
    const fx = await seed();
    try {
      const { id: a, } = await createPngAsset(fx, fx.ownerId, "a.png",);
      const res = await post(
        makeApp(fx, fx.ownerId, {
          mutate: (c,) => {
            c.assets.enabled = false;
          },
        },),
        "/api/assets/batch-download",
        { ids: [a,], },
      );

      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("422 on an empty selection", async () => {
    const fx = await seed();
    try {
      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", { ids: [], },);
      expect(res.status,).toBe(422,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("422 above the 200-id batch cap", async () => {
    const fx = await seed();
    try {
      const ids = Array.from({ length: 201, }, () => randomUUID(),);
      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", { ids, },);
      expect(res.status,).toBe(422,);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("POST /api/assets/batch-delete", () => {
  test("401 for anonymous callers", async () => {
    const fx = await seed();
    try {
      const res = await post(makeApp(fx, null,), "/api/assets/batch-delete", { ids: [randomUUID(),], },);
      expect(res.status,).toBe(401,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("deletes caller-owned assets and reports exactly what was removed", async () => {
    const fx = await seed();
    try {
      const { id: a, } = await createPngAsset(fx, fx.ownerId, "a.png",);
      const { id: b, } = await createPngAsset(fx, fx.ownerId, "b.png",);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-delete", { ids: [a, b,], },);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { ok: boolean; deleted: string[] };
      expect(body.ok,).toBe(true,);
      expect(body.deleted.sort(),).toEqual([a, b,].sort(),);

      const remaining = await fx.db.selectFrom("assets",).select("id",).execute();
      expect(remaining,).toHaveLength(0,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("mixed ownership: deletes only the caller's own rows", async () => {
    const fx = await seed();
    try {
      const { id: mine, } = await createPngAsset(fx, fx.strangerId, "mine.png",);
      const { id: foreign, } = await createPngAsset(fx, fx.ownerId, "foreign.png",);

      const res = await post(makeApp(fx, fx.strangerId,), "/api/assets/batch-delete", {
        ids: [mine, foreign, randomUUID(),],
      },);

      expect(res.status,).toBe(200,);
      const body = await res.json() as { ok: boolean; deleted: string[] };
      expect(body.deleted,).toEqual([mine,],);

      const stillThere = await fx.db.selectFrom("assets",).select("id",).where("id", "=", foreign,).executeTakeFirst();
      expect(stillThere?.id,).toBe(foreign,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("admins get the same owner-only contract as single-asset delete", async () => {
    const fx = await seed();
    try {
      const { id: foreign, } = await createPngAsset(fx, fx.ownerId, "foreign.png",);

      const res = await post(makeApp(fx, fx.strangerId, { userRole: "admin", },), "/api/assets/batch-delete", {
        ids: [foreign,],
      },);

      expect(res.status,).toBe(404,);
      const stillThere = await fx.db.selectFrom("assets",).select("id",).executeTakeFirst();
      expect(stillThere?.id,).toBe(foreign,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("404 when nothing in the selection is deletable", async () => {
    const fx = await seed();
    try {
      const res = await post(makeApp(fx, fx.strangerId,), "/api/assets/batch-delete", { ids: [randomUUID(),], },);
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("404 when the asset system is disabled", async () => {
    const fx = await seed();
    try {
      const { id: a, } = await createPngAsset(fx, fx.ownerId, "a.png",);
      const res = await post(
        makeApp(fx, fx.ownerId, {
          mutate: (c,) => {
            c.assets.enabled = false;
          },
        },),
        "/api/assets/batch-delete",
        { ids: [a,], },
      );

      expect(res.status,).toBe(404,);
      const stillThere = await fx.db.selectFrom("assets",).select("id",).executeTakeFirst();
      expect(stillThere?.id,).toBe(a,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("422 on an empty selection", async () => {
    const fx = await seed();
    try {
      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-delete", { ids: [], },);
      expect(res.status,).toBe(422,);
    } finally {
      await cleanup(fx,);
    }
  });
});
