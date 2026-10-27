// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `/import` — importing a character card from an uploaded file.
 *
 * The command reuses the EXISTING import infrastructure: the card parser and
 * the card validator from `src/characters/parser.ts`. It never persists — it
 * returns a preview action the frontend confirms before the file is posted to
 * the real import route.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Config, } from "../../config/schema";
import { AssetType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { configureQuotaStorage, } from "../quota/storage";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";
import "./import";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const importCommand = mustGet("import",);

describe("/import", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let uploadDir: string;

  const ctx = (overrides?: Partial<CommandContext>,): CommandContext => ({
    chatId: "chat-1",
    db,
    userId: ownerId,
    // The upload directory is the only part of the config the command reads.
    config: { assets: { uploadDir, }, } as unknown as Config,
    ...overrides,
  });

  /**
   * Store an uploaded file and register it as an asset the caller owns.
   * @param filename - the file name the caller refers to
   * @param content - the file content
   * @returns the asset id
   */
  const uploadAsset = async (filename: string, content: string,): Promise<string> => {
    writeFileSync(join(uploadDir, filename,), content,);
    const id = `asset-${crypto.randomUUID()}`;
    await db.insertInto("assets",).values({
      id,
      owner_id: ownerId,
      filename,
      mime_type: "application/json",
      asset_type: AssetType.Other,
      size_bytes: content.length,
      storage_path: filename,
    },).execute();

    return id;
  };

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-import-cmd-",),);
  },);

  afterAll(async () => {
    rmSync(uploadDir, { recursive: true, force: true, },);
    await db.destroy();
  },);

  beforeEach(async () => {
    await db.deleteFrom("assets",).execute();
    ownerId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
  },);

  test("previews a JSON character card without importing it", async () => {
    const card = JSON.stringify({
      name: "Rin",
      description: "A ranger",
      personality: "wry",
      appearance: "tall",
      scenario: "",
      default_outfit: "travel-gear",
      outfits: [{ id: "travel-gear", name: "Travel Gear", descriptor: "Sturdy clothes", },],
    },);

    const assetId = await uploadAsset("rin.json", card,);

    const result = await importCommand(["character", assetId,], ctx(),);

    expect(result.action,).toBe("import-entity",);
    const payload = result.actionPayload ?? {};
    expect(payload.assetId,).toBe(assetId,);
    expect(payload.name,).toBe("Rin",);
    expect(payload.filename,).toBe("rin.json",);
    expect(result.systemMessage,).toContain("**Import preview**",);
    expect(result.systemMessage,).toContain("rin.json",);

    // The command is preview-only: no character was created.
    const actors = await db.selectFrom("actors",).selectAll().execute();
    expect(actors.length,).toBe(0,);
  });

  test("previews a TOML character card", async () => {
    const toml = [
      "[character]",
      `name = "Rin"`,
      `description = "A ranger"`,
      `personality = "wry"`,
      `appearance = "tall"`,
      `default_outfit = "travel-gear"`,
      `[[character.outfits]]`,
      `id = "travel-gear"`,
      `name = "Travel Gear"`,
      `descriptor = "Sturdy clothes"`,
      "",
    ].join("\n",);

    const assetId = await uploadAsset("rin.toml", toml,);

    const result = await importCommand(["character", assetId,], ctx(),);

    expect(result.action,).toBe("import-entity",);
    expect((result.actionPayload ?? {}).name,).toBe("Rin",);
  });

  test("rejects a file that is not a character card", async () => {
    const assetId = await uploadAsset("broken.json", "{not json",);

    const result = await importCommand(["character", assetId,], ctx(),);

    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("**Import rejected:**",);
  });

  test("reports a file the caller never uploaded", async () => {
    const result = await importCommand(["character", "ghost.json",], ctx(),);

    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("No uploaded file",);
  });

  test("rejects an unsupported entity kind", async () => {
    const result = await importCommand(["location", "rin.json",], ctx(),);

    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("Unknown entity kind",);
  });

  test("quota exhaustion denies the import before the asset is read", async () => {
    const assetId = await uploadAsset("rin.json", "{}",);
    configureQuotaStorage({ windowMs: 60_000, limitPerWindow: 3, },);
    try {
      const spendUser = `quota-${crypto.randomUUID()}`;
      // Cost 4 > the 3-unit window: denied before resolveImportAsset runs.
      const denied = await importCommand(["character", assetId,], ctx({ userId: spendUser, },),);

      expect(denied.handled,).toBe(true,);
      expect(denied.systemMessage,).toContain("**Quota exceeded for `import`.**",);
      expect(denied.systemMessage,).toContain("Nothing ran",);
      expect(denied.action,).toBeUndefined();
    } finally {
      configureQuotaStorage({ windowMs: 24 * 60 * 60 * 1000, limitPerWindow: 200, },);
    }
  });
});
