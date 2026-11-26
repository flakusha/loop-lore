// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Init-image plumbing on POST /api/v1/generation/image: ownership, stale
 * asset handling and the asset-bytes round trip into the engine options.
 * Self-contained ISOLATED file — module mocks here never leak to siblings.
 */
import { expect, it, mock, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtempSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import * as realConfigLoad from "../config/load";
import { createConfigSchema, } from "../config/schema-class";
import { AssetType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertAssets, } from "../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";
import * as realImageEngine from "./image-engine";
import type * as imageGenRoute from "./image-gen-route";

const uploadDir = mkdtempSync(join(tmpdir(), "ll-init-img-",),);
const INIT_BYTES = Buffer.from("authorized-init-png",);

const capturedOpts: Array<Record<string, unknown>> = [];

/** Capture the engine options instead of running a provider. */
async function mockFailover(
  _providers: unknown,
  _purpose: unknown,
  opts: Record<string, unknown>,
) {
  capturedOpts.push(opts,);
  return { ok: true, images: [Buffer.from("fake-image-bytes",),], mimeType: "image/png", };
}

let handleImageGeneration: typeof imageGenRoute.handleImageGeneration;

if (ISOLATED) {
  mock.module("../config/load", () => ({
    ...realConfigLoad,
    loadConfig: () => ({
      ...structuredClone(createConfigSchema().defaults,),
      assets: { uploadDir, },
      generation: {
        providers: {
          sd: [{
            name: "test-comfy",
            label: "Test ComfyUI",
            baseUrl: "http://127.0.0.1:8188",
            apiFamily: "comfyui",
            purpose: "generate",
            defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
            timeout: 30_000,
            generationTimeout: 300_000,
          },],
        },
      },
    }),
  }),);

  mock.module("./image-engine", () => ({
    ...realImageEngine,
    generateImagesWithFailover: mockFailover,
  }),);

  ({ handleImageGeneration, } = await import("./image-gen-route"));
}

async function seedUser(db: Kysely<DB>, id: string,) {
  await db.insertInto("users",).values({
    id,
    username: id,
    display_name: id,
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();
}

/** Seed an asset row and, when `withFile`, its bytes on disk. */
async function seedAsset(
  db: Kysely<DB>,
  id: string,
  ownerId: string,
  withFile: boolean,
): Promise<string> {
  const storagePath = `init-${id}.png`;
  await insertAssets(db, ownerId, "init.png", "image/png", AssetType.Image, INIT_BYTES.length, storagePath, { id, },);
  if (withFile) { writeFileSync(join(uploadDir, storagePath,), INIT_BYTES,); }
  return storagePath;
}

describeOrSkip("image-gen-route init image", () => {
  it("refuses a foreign asset before any provider call", async () => {
    const { db, } = await createTestDb();
    await seedUser(db, "test-user",);
    await seedUser(db, "other-user",);
    await seedAsset(db, "foreign-asset", "other-user", true,);
    capturedOpts.length = 0;

    const res = await handleImageGeneration(
      { prompt: "edit it", init_image: "foreign-asset", },
      db,
      "test-user",
    );

    expect(res.status,).toBe(404,);
    expect(capturedOpts,).toHaveLength(0,);
  });

  it("refuses a missing asset id", async () => {
    const { db, } = await createTestDb();
    await seedUser(db, "test-user",);
    capturedOpts.length = 0;

    const res = await handleImageGeneration(
      { prompt: "edit it", init_image: "does-not-exist", },
      db,
      "test-user",
    );

    expect(res.status,).toBe(404,);
    expect(capturedOpts,).toHaveLength(0,);
  });

  it("refuses an owned asset whose file was deleted", async () => {
    const { db, } = await createTestDb();
    await seedUser(db, "test-user",);
    await seedAsset(db, "stale-asset", "test-user", false,);
    capturedOpts.length = 0;

    const res = await handleImageGeneration(
      { prompt: "edit it", init_image: "stale-asset", },
      db,
      "test-user",
    );

    expect(res.status,).toBe(404,);
    expect(capturedOpts,).toHaveLength(0,);
  });

  it("round-trips owned asset bytes into the engine initImage field", async () => {
    const { db, } = await createTestDb();
    await seedUser(db, "test-user",);
    await seedAsset(db, "owned-asset", "test-user", true,);
    capturedOpts.length = 0;

    const res = await handleImageGeneration(
      { prompt: "edit it", init_image: "owned-asset", workflow: "img2img", denoising_strength: 0.5, },
      db,
      "test-user",
    );

    expect(res.status,).toBe(200,);
    expect(capturedOpts,).toHaveLength(1,);
    const initImage = capturedOpts[0]?.initImage as { assetId: string; buffer: Buffer } | undefined;
    expect(initImage?.assetId,).toBe("owned-asset",);
    expect(initImage?.buffer.toString("utf8",),).toBe(INIT_BYTES.toString("utf8",),);
    expect(capturedOpts[0]?.workflow,).toBe("img2img",);
    expect(capturedOpts[0]?.denoise,).toBe(0.5,);
  });
},);
