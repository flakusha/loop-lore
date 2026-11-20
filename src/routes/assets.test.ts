// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the asset batch surface (gallery batch §7.7):
 * POST /api/assets/batch-download (server-side zip),
 * POST /api/assets/download-all (zip of the gallery filter set),
 * POST /api/assets/batch-delete, and the download-naming preferences.
 *
 * Pins the trust boundary on every endpoint: 401 anonymous, silent omission
 * of inaccessible ids (no existence oracle), NSFW rating visibility, the
 * assets-disabled guard, and the empty-selection validation error. Download
 * coverage additionally pins: naming modes (per-request override, stored
 * preference, admin default), chat-context decryption of linked encrypted
 * assets (unlinked/wrong-chat skips are counted, never leaked), per-class
 * skip-count headers, and the 500-asset truncation header.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import JSZip from "jszip";
import type { Kysely, } from "kysely";
import { randomBytes, randomUUID, } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { initAgeGate, } from "../age-gate/controller";
import { createAsset, } from "../assets/service";
import { makeMinimalPng, } from "../assets/test-helpers";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import { deriveChatKeyForChat, encryptAssetBlob, getSmk, initSmk, } from "../crypto";
import { AgeGateMode, AssetLinkEntity, AssetType, AssetVisibility, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertAssetLinks,
  insertAssets,
  insertChats,
  insertUsers,
} from "../test-utils/insert-helpers";
import { assetsRoutes, DOWNLOAD_ALL_MAX, zipEntryName, } from "./assets";

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

function put(app: ReturnType<typeof makeApp>, path: string, body: unknown,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

function get(app: ReturnType<typeof makeApp>, path: string,): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`,),);
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

describe("batch-download naming", () => {
  test("hash naming override prefixes entry names", async () => {
    const fx = await seed();
    try {
      // Deduped row (not the dedupe:false fixture): carries a real content hash.
      const bytes = makeMinimalPng(9, 6,);
      const { asset, } = await createAsset({
        database: fx.db,
        input: {
          ownerId: fx.ownerId,
          filename: "alpha.png",
          mimeType: "image/png",
          assetType: AssetType.Image,
          sizeBytes: bytes.length,
          buffer: bytes,
        },
        uploadDir: fx.uploadDir,
      },);

      const row = await fx.db.selectFrom("assets",).select("content_hash",).where("id", "=", asset.id,)
        .executeTakeFirstOrThrow();

      const hash = (row.content_hash ?? "").slice(0, 8,);
      expect(hash.length,).toBe(8,);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", {
        ids: [asset.id,],
        naming: "hash",
      },);

      expect(res.status,).toBe(200,);
      const entries = await zipEntries(res,);
      expect([...entries.keys(),],).toEqual([`${hash}_alpha.png`,],);
    } finally {
      await cleanup(fx,);
    }
  });

  test("stored preference applies when the request names no mode", async () => {
    const fx = await seed();
    try {
      const { id: a, } = await createPngAsset(fx, fx.ownerId, "alpha.png",);
      const saved = await put(makeApp(fx, fx.ownerId,), "/api/assets/preferences", {
        downloadNaming: "datetime",
      },);

      expect(saved.status,).toBe(200,);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", { ids: [a,], },);
      expect(res.status,).toBe(200,);
      const entries = await zipEntries(res,);
      const names = [...entries.keys(),];
      expect(names.length,).toBe(1,);
      expect(names[0],).toMatch(/^\d{14}_alpha\.png$/,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("per-request naming beats the stored preference", async () => {
    const fx = await seed();
    try {
      const { id: a, } = await createPngAsset(fx, fx.ownerId, "alpha.png",);
      await put(makeApp(fx, fx.ownerId,), "/api/assets/preferences", { downloadNaming: "hash", },);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", {
        ids: [a,],
        naming: "raw",
      },);

      expect(res.status,).toBe(200,);
      const entries = await zipEntries(res,);
      expect([...entries.keys(),],).toEqual(["alpha.png",],);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("POST /api/assets/batch-download with chat context", () => {
  // SMK is process-global: scope it to this describe and reset to disabled
  // afterwards, mirroring the crypto suites, so sibling files keep their
  // own key lifecycle.
  const HEX = randomBytes(32,).toString("hex",);
  beforeAll(async () => {
    await initSmk({ serverEncryptionKey: HEX, required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  },);

  afterAll(async () => {
    await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  },);

  /** Real ciphertext on disk: provisioned chat key, per-asset subkey, chat link. */
  async function createEncryptedAsset(
    fx: Fixture,
    ownerId: string,
    filename: string,
    chatId: string,
  ): Promise<{ id: string; plaintext: Buffer }> {
    const smk = getSmk();
    if (!smk) { throw new Error("SMK not initialized",); }
    // chat_keys.chat_id is a real FK: the chat row must exist first.
    await insertChats(fx.db, `chat-${chatId}`, fx.ownerId, { id: chatId, },);
    const assetId = randomUUID();
    const key = await deriveChatKeyForChat(fx.db, chatId, smk,);
    const plaintext = Buffer.from(makeMinimalPng(6, 4,),);
    const sealed = await encryptAssetBlob(
      plaintext,
      key,
      key.keyId,
      assetId,
      { threshold: 128, algorithm: "gzip", },
      "standard",
    );

    const storagePath = `${assetId}.enc`;
    writeFileSync(join(fx.uploadDir, storagePath,), sealed.data,);
    await insertAssets(fx.db, ownerId, filename, "image/png", AssetType.Image, sealed.data.length, storagePath, {
      id: assetId,
      visibility: AssetVisibility.Private,
      encryption_tier: "standard",
      encrypted_key_id: key.keyId,
    },);

    await insertAssetLinks(fx.db, assetId, AssetLinkEntity.Chat, chatId,);
    return { id: assetId, plaintext, };
  }

  test("decrypts chat-linked encrypted assets into the zip", async () => {
    const fx = await seed();
    try {
      const chatId = randomUUID();
      const { id: present, buffer: alphaBytes, } = await createPngAsset(fx, fx.ownerId, "alpha.png",);
      const { id: secret, plaintext, } = await createEncryptedAsset(fx, fx.ownerId, "secret.png", chatId,);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", {
        ids: [present, secret,],
        chatId,
      },);

      expect(res.status,).toBe(200,);
      expect(res.headers.get("X-Download-Encrypted-Skipped",),).toBe("0",);
      expect(res.headers.get("X-Download-Included",),).toBe("2",);
      const entries = await zipEntries(res,);
      expect([...entries.keys(),].sort(),).toEqual(["alpha.png", "secret.png",],);
      expect(bytesEqual(entries.get("alpha.png",) ?? new Uint8Array(), alphaBytes,),).toBe(true,);
      const decrypted = Buffer.from(entries.get("secret.png",) ?? new Uint8Array(),);
      expect(Buffer.compare(decrypted, plaintext,),).toBe(0,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("without chat context encrypted assets are skipped and counted", async () => {
    const fx = await seed();
    try {
      const { id: present, } = await createPngAsset(fx, fx.ownerId, "present.png",);
      const { id: secret, } = await createEncryptedAsset(fx, fx.ownerId, "secret.png", randomUUID(),);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", {
        ids: [present, secret,],
      },);

      expect(res.status,).toBe(200,);
      expect(res.headers.get("X-Download-Encrypted-Skipped",),).toBe("1",);
      expect(res.headers.get("X-Download-Included",),).toBe("1",);
      const entries = await zipEntries(res,);
      expect([...entries.keys(),],).toEqual(["present.png",],);
    } finally {
      await cleanup(fx,);
    }
  });

  test("a chat the asset is not linked to still skips (404 when alone)", async () => {
    const fx = await seed();
    try {
      const { id: secret, } = await createEncryptedAsset(fx, fx.ownerId, "secret.png", randomUUID(),);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/batch-download", {
        ids: [secret,],
        chatId: randomUUID(),
      },);

      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("POST /api/assets/download-all", () => {
  test("401 for anonymous callers", async () => {
    const fx = await seed();
    try {
      const res = await post(makeApp(fx, null,), "/api/assets/download-all", {},);
      expect(res.status,).toBe(401,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("zips the caller's visible set with skip-count headers", async () => {
    const fx = await seed();
    try {
      await createPngAsset(fx, fx.ownerId, "alpha.png", 4,);
      await createPngAsset(fx, fx.ownerId, "beta.png", 5,);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/download-all", {},);
      expect(res.status,).toBe(200,);
      expect(res.headers.get("X-Download-Included",),).toBe("2",);
      expect(res.headers.get("X-Download-Nsfw-Skipped",),).toBe("0",);
      expect(res.headers.get("X-Download-Encrypted-Skipped",),).toBe("0",);
      expect(res.headers.get("X-Download-Missing-Skipped",),).toBe("0",);
      expect(res.headers.get("X-Download-Truncated",),).toBeNull();
      const entries = await zipEntries(res,);
      expect([...entries.keys(),].sort(),).toEqual(["alpha.png", "beta.png",],);
    } finally {
      await cleanup(fx,);
    }
  });

  test("q and type filters narrow the set", async () => {
    const fx = await seed();
    try {
      await createPngAsset(fx, fx.ownerId, "alpha.png", 4,);
      await createPngAsset(fx, fx.ownerId, "beta.png", 5,);
      writeFileSync(join(fx.uploadDir, "clip.webm",), new Uint8Array([1, 2, 3,],),);
      await insertAssets(fx.db, fx.ownerId, "clip.webm", "video/webm", AssetType.Video, 3, "clip.webm", {
        visibility: AssetVisibility.Private,
      },);

      const byName = await post(makeApp(fx, fx.ownerId,), "/api/assets/download-all", { q: "alpha", },);
      expect(byName.status,).toBe(200,);
      expect([...(await zipEntries(byName,)).keys(),],).toEqual(["alpha.png",],);

      const byType = await post(makeApp(fx, fx.ownerId,), "/api/assets/download-all", { type: "video", },);
      expect(byType.status,).toBe(200,);
      expect([...(await zipEntries(byType,)).keys(),],).toEqual(["clip.webm",],);
    } finally {
      await cleanup(fx,);
    }
  });

  test("entity filter scopes to linked chat assets", async () => {
    const fx = await seed();
    try {
      const { id: linked, } = await createPngAsset(fx, fx.ownerId, "linked.png",);
      await createPngAsset(fx, fx.ownerId, "other.png",);
      const chatId = await insertChats(fx.db, "chat", fx.ownerId,);
      await insertAssetLinks(fx.db, linked, AssetLinkEntity.Chat, chatId,);

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/download-all", {
        entityType: "chat",
        entityId: chatId,
      },);

      expect(res.status,).toBe(200,);
      expect([...(await zipEntries(res,)).keys(),],).toEqual(["linked.png",],);
    } finally {
      await cleanup(fx,);
    }
  });

  test("strangers receive only public assets", async () => {
    const fx = await seed();
    try {
      await createPngAsset(fx, fx.ownerId, "private.png",);
      writeFileSync(join(fx.uploadDir, "open.png",), makeMinimalPng(4, 3,),);
      await insertAssets(fx.db, fx.ownerId, "open.png", "image/png", AssetType.Image, 10, "open.png", {
        visibility: AssetVisibility.Public,
      },);

      const res = await post(makeApp(fx, fx.strangerId,), "/api/assets/download-all", {},);
      expect(res.status,).toBe(200,);
      expect([...(await zipEntries(res,)).keys(),],).toEqual(["open.png",],);
    } finally {
      await cleanup(fx,);
    }
  });

  test("past the cap the zip truncates with a header", async () => {
    expect(DOWNLOAD_ALL_MAX,).toBe(500,);
    const fx = await seed();
    try {
      for (let i = 0; i < DOWNLOAD_ALL_MAX + 1; i++) {
        const name = `bulk-${i}.png`;
        writeFileSync(join(fx.uploadDir, name,), new Uint8Array([i % 256,],),);
        await insertAssets(fx.db, fx.ownerId, name, "image/png", AssetType.Image, 1, name, {
          id: `bulk-${i}-0000-4000-8000-${String(i,).padStart(12, "0",)}`,
          visibility: AssetVisibility.Private,
        },);
      }

      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/download-all", {},);
      expect(res.status,).toBe(200,);
      expect(res.headers.get("X-Download-Truncated",),).toBe("true",);
      expect(res.headers.get("X-Download-Included",),).toBe(String(DOWNLOAD_ALL_MAX,),);
      expect((await zipEntries(res,)).size,).toBe(DOWNLOAD_ALL_MAX,);
    } finally {
      await cleanup(fx,);
    }
  }, 60000,);

  test("404 when filters match nothing downloadable", async () => {
    const fx = await seed();
    try {
      await createPngAsset(fx, fx.ownerId, "alpha.png",);
      const res = await post(makeApp(fx, fx.ownerId,), "/api/assets/download-all", { q: "nope", },);
      expect(res.status,).toBe(404,);
    } finally {
      await cleanup(fx,);
    }
  });
});

describe("GET /api/assets/preferences + PUT /api/assets/preferences", () => {
  test("401 for anonymous callers", async () => {
    const fx = await seed();
    try {
      expect((await get(makeApp(fx, null,), "/api/assets/preferences",)).status,).toBe(401,);
      expect((await put(makeApp(fx, null,), "/api/assets/preferences", { downloadNaming: "hash", },)).status,).toBe(
        401,
      );
    } finally {
      await cleanup(fx,);
    }
  });

  test("unset preference reads null (admin default applies)", async () => {
    const fx = await seed();
    try {
      const res = await get(makeApp(fx, fx.ownerId,), "/api/assets/preferences",);
      expect(res.status,).toBe(200,);
      // jsonResponse envelopes every payload with meta; assert the fields.
      const body = (await res.json()) as { ok: boolean; downloadNaming: string | null };
      expect(body.ok,).toBe(true,);
      expect(body.downloadNaming,).toBeNull();
    } finally {
      await cleanup(fx,);
    }
  });

  test("put stores the override and null clears it", async () => {
    const fx = await seed();
    try {
      const app = makeApp(fx, fx.ownerId,);
      const saved = await put(app, "/api/assets/preferences", { downloadNaming: "datetime-hash", },);
      expect(saved.status,).toBe(200,);
      expect(((await saved.json()) as { downloadNaming: string }).downloadNaming,).toBe("datetime-hash",);

      const cleared = await put(app, "/api/assets/preferences", { downloadNaming: null, },);
      expect(((await cleared.json()) as { downloadNaming: string | null }).downloadNaming,).toBeNull();
    } finally {
      await cleanup(fx,);
    }
  });

  test("422 on an unknown mode", async () => {
    const fx = await seed();
    try {
      const res = await put(makeApp(fx, fx.ownerId,), "/api/assets/preferences", {
        downloadNaming: "gallery",
      },);

      expect(res.status,).toBe(422,);
    } finally {
      await cleanup(fx,);
    }
  });
});
