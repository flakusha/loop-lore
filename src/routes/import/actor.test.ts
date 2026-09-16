// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct tests for importActor (src/routes/import/actor.ts).
 *
 * The HTTP route tests only exercise the no-assets / no-lorebook path, so
 * the CHARX-asset helper (lines 74-79, 111-162) and the lorebook branch
 * (lines 82-87) never load under the diff-scoped coverage gate. These tests
 * call importActor directly: validation rejection, lorebook import warnings,
 * CHARX avatar import (with one failing asset proving failures stay
 * warnings), and the no-uploadDir skip.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { makeMinimalPng, } from "../../assets/test-helpers";
import type { CanonicalCharacter, } from "../../characters/parser";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { importActor, } from "./actor";

function character(overrides: Partial<CanonicalCharacter> = {},): CanonicalCharacter {
  return {
    name: "Direct Import",
    description: "Imported via direct importActor call",
    personality: "bold",
    appearance: "Tall ranger",
    default_outfit: "travel-gear",
    outfits: [{ id: "travel-gear", name: "Travel Gear", descriptor: "Sturdy clothes", },],
    ...overrides,
  } as CanonicalCharacter;
}

describe("importActor", () => {
  let db: Kysely<DB>;
  let userId: string;
  let uploadDir: string;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await insertUsers(db, "direct-importer", "Direct Importer",);
    userId = (await db.selectFrom("users",).select("id",).where("username", "=", "direct-importer",)
      .executeTakeFirstOrThrow()).id;
    uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-import-actor-",),);
  },);

  afterAll(async () => {
    rmSync(uploadDir, { recursive: true, force: true, },);
    await db.destroy();
  },);

  test("throws on invalid character", async () => {
    await expect(importActor({
      character: character({ name: "", },),
      format: "ccv2",
      warnings: [],
      database: db,
      userId,
    },),).rejects.toThrow("Name is required",);
  });

  test("imports lorebook entries into actor_lore_entries", async () => {
    const warnings: string[] = [];
    const res = await importActor({
      character: character({
        name: "Lore Keeper",
        lorebook: {
          entries: [{
            id: 1,
            name: "Kingdom",
            content: "A kingdom.",
            keys: ["kingdom",],
            selective: false,
            case_sensitive: false,
            enabled: true,
            constant: false,
            position: "before_char",
            insertion_order: 1,
            priority: 1,
          },],
        },
      },),
      format: "ccv2",
      warnings,
      database: db,
      userId,
    },);
    expect(res.status,).toBe(201,);
    expect(warnings.join("\n",),).toContain("Imported 1 lore entries",);
    const { id, } = (await res.json()) as { id: string };
    const row = await db.selectFrom("actor_lore_entries",).selectAll().where("actor_id", "=", id,)
      .executeTakeFirst();
    expect(row?.content,).toBe("A kingdom.",);
  });

  test("imports CHARX avatars", async () => {
    const charxAssets = [
      { name: "portrait.png", type: "avatar", data: makeMinimalPng(4, 3,), },
      { name: "photo.jpg", type: "avatar", data: makeMinimalPng(7, 5,), },
    ];

    const warnings: string[] = [];
    const res = await importActor({
      character: character({
        name: "Charx Hero",
        description: "Imported from CHARX",
        personality: "brave",
        appearance: "Armored traveler",
        default_outfit: "plate",
        outfits: [{ id: "plate", name: "Plate", descriptor: "Shining plate", },],
      },),
      format: "charx",
      warnings,
      database: db,
      userId,
      charxAssets,
      uploadDir,
    },);
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { assets_imported: number };
    expect(body.assets_imported,).toBe(2,);
    expect(warnings.join("\n",),).toContain("Imported 2 avatar(s) from CHARX",);
  });

  test("turns CHARX asset failures into warnings without failing import", async () => {
    // A regular file as uploadDir: storeFile's mkdirSync throws ENOTDIR.
    const fileAsDir = join(uploadDir, "not-a-dir",);
    await Bun.write(fileAsDir, "blocking file",);
    const warnings: string[] = [];
    const res = await importActor({
      character: character({ name: "Broken Assets", },),
      format: "charx",
      warnings,
      database: db,
      userId,
      charxAssets: [{ name: "fresh-broken.png", type: "avatar", data: makeMinimalPng(11, 9,), },],
      uploadDir: fileAsDir,
    },);
    expect(res.status,).toBe(201,);
    expect(warnings.some((w,) => w.includes("Failed to import asset",)),).toBe(true,);
    expect(warnings.join("\n",),).not.toContain("avatar(s) from CHARX",);
  });

  test("skips CHARX assets without an uploadDir", async () => {
    const warnings: string[] = [];
    const res = await importActor({
      character: character({ name: "No Upload Dir", },),
      format: "charx",
      warnings,
      database: db,
      userId,
      charxAssets: [{ name: "avatar.png", type: "avatar", data: makeMinimalPng(2, 1,), },],
    },);
    expect(res.status,).toBe(201,);
    expect(warnings.join("\n",),).not.toContain("avatar(s) from CHARX",);
  });
});
