// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import JSZip from "jszip";
import type { Kysely, } from "kysely";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { exportAssetsToZip, } from "./assets";
import type { ExportContext, } from "./types";

describe("exportAssetsToZip", () => {
  let db: Kysely<DB>;
  let userId: string;
  let dir: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    dir = mkdtempSync(join(tmpdir(), "export-assets-",),);

    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Test User",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();
  },);

  afterAll(async () => {
    rmSync(dir, { recursive: true, force: true, },);
    await db.destroy();
  },);

  test("zips a real asset file and records its checksum", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5,],);
    const storagePath = join(dir, "pic.png",);
    writeFileSync(storagePath, bytes,);
    const assetId = uid();
    await db
      .insertInto("assets",)
      .values({
        id: assetId,
        owner_id: userId,
        filename: "pic.png",
        mime_type: "image/png",
        asset_type: "image",
        size_bytes: bytes.length,
        storage_path: storagePath,
        storage_backend: "local",
        visibility: "private",
      },)
      .execute();

    const zip = new JSZip();
    const ctx: ExportContext = {
      database: db,
      userId,
      zip,
      checksums: {},
      format: "json",
      counts: {},
    };
    await exportAssetsToZip(ctx,);

    expect(ctx.counts.assets,).toBe(1,);
    const key = `assets/${assetId}-pic.png`;
    expect(ctx.checksums[key],).toMatch(/^sha256:[0-9a-f]{64}$/,);
    const file = zip.file(key,);
    expect(file,).not.toBeNull();
  });
});
