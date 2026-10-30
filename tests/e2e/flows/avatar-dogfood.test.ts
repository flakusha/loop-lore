// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: Avatar Dogfood — fresh-DB verification (TASK-avatar-dogfood-e2e-verify,
 * epic-avatar-dogfood step 7).
 *
 * Drives the epic's 7-step dogfood scenario end to end against a freshly
 * migrated DB and an empty upload dir:
 *
 *   1. Fresh boot        — in-memory DB (migrations), empty temp upload dir.
 *   2. Chat + generation — steps 1–4 of the scenario (ask the assistant, /
 *                          image generate, curate) are unit-pinned by slice 1
 *                          (image-gen-route.test.ts /avatar binding) and the
 *                          slice-2 master pipeline; here the "generation
 *                          output" is a deterministic sharp-built PNG — the
 *                          same no-network stand-in spirit as MockLLMProvider
 *                          for the LLM side. No mock SD provider exists in
 *                          the harness and this test does not invent one.
 *   3. Promote           — the REAL promoteAvatarToDefault op writes the
 *                          master into a temp repo-root cell and returns the
 *                          `{ type: "file", path }` literal an operator pastes
 *                          into defaults.ts; this test flips the template's
 *                          avatar exactly that way.
 *   4. Clean + restart   — a SECOND fresh DB + upload dir (the "wipe"), then
 *                          the production seeder `seedCharacterTemplates`.
 *   5. Verify            — each promoted character's primary avatar bytes
 *                          byte-equal the committed master file; unpromoted
 *                          templates still seed the SVG placeholder; a second
 *                          seed run is insert-once (nothing changes).
 *
 * Runs the verify leg for both master formats: slice-2 webp (default) and the
 * slice-1 png cell.
 */

import { resolveTemplateAvatar, } from "@/characters/seed/avatar";
import { promoteAvatarToDefault, type PromoteMasterFormat, } from "@/characters/seed/promote";
import { seedCharacterTemplates, } from "@/characters/seed/templates";
import type { CharactersConfig, } from "@/config/schema";
import { CHARACTERS_DEFAULTS, } from "@/config/sections/characters/defaults";
import type { DB, } from "@/db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "@/test-utils/create-test-db";
import { describePristine, } from "@/test-utils/pristine";
import { afterAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import sharp from "sharp";

// The seeder persists avatar assets through createAsset, which
// src/generation/image-gen-route.test.ts replaces process-wide with a fixed
// fixture row. Probe and skip rather than assert the stub (e2e suites run
// last, so the stub wins) — same guard as tests/e2e/flows/assets.test.ts.
const { createAsset, } = await import("@/assets/service/create");
const describeReal = describePristine(createAsset, "createAsset",);

const TEMPLATES = CHARACTERS_DEFAULTS.templates;

/** Deterministic "generation output": a real PNG, no network (see header). */
async function makeGeneratedArt(size = 16,): Promise<Buffer> {
  return await sharp({ create: { width: size, height: size, channels: 4, background: "#2b4c7e", }, },)
    .png({},)
    .toBuffer();
}

/** The SVG placeholder bytes the seeder produces for unpromoted templates. */
const PLACEHOLDER = resolveTemplateAvatar({ type: "default", },)!;

interface DogfoodFixture {
  /** Temp repo root the promote op writes the master cell into. */
  repoRoot: string;
  /** The promoted master's absolute path (the "committed file"). */
  masterAbs: string;
  /** Characters config with the promoted template flipped to the file hook. */
  charactersConfig: CharactersConfig;
  uploadDir: string;
}

/**
 * Operator flow: promote real bytes for Elara and flip her template avatar —
 * exactly the runbook promote.ts documents (minus the defaults.ts hand-edit,
 * replaced by the in-memory config the seeder consumes).
 */
async function promoteElara(master: PromoteMasterFormat,): Promise<DogfoodFixture> {
  const repoRoot = mkdtempSync(join(tmpdir(), "loop-lore-dogfood-repo-",),);
  const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-dogfood-uploads-",),);
  mkdirSync(uploadDir, { recursive: true, },);

  const promoted = await promoteAvatarToDefault({
    template: { id: "tpl-elara-nightwhisper", name: "Elara Nightwhisper", },
    bytes: await makeGeneratedArt(16,),
    repoRoot,
    master,
  },);

  const templates = structuredClone(TEMPLATES,) as CharactersConfig["templates"];
  const elara = templates.find((t,) => t.id === "tpl-elara-nightwhisper");
  if (!elara) { throw new Error("fixture: tpl-elara-nightwhisper missing from CHARACTERS_DEFAULTS",); }
  // The operator paste step — absolute for the seeder's readFileSync.
  elara.avatar = { type: "file", path: join(repoRoot, ...promoted.path.split("/",),), };

  return {
    repoRoot,
    uploadDir,
    masterAbs: join(repoRoot, ...promoted.path.split("/",),),
    charactersConfig: { enabled: true, templates, },
  };
}

/** Primary avatar bytes for an actor, read back from the seeded upload dir. */
async function primaryAvatarBytes(
  db: Kysely<DB>,
  uploadDir: string,
  displayName: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const row = await db
    .selectFrom("character_avatars",)
    .innerJoin("actors", "actors.id", "character_avatars.actor_id",)
    .innerJoin("assets", "assets.id", "character_avatars.asset_id",)
    .select(["assets.storage_path", "assets.mime_type",],)
    .where("actors.display_name", "=", displayName,)
    .where("character_avatars.is_primary", "=", 1,)
    .executeTakeFirst();

  if (!row) { throw new Error(`no primary avatar seeded for ${displayName}`,); }
  return {
    bytes: readFileSync(join(uploadDir, row.storage_path,),),
    mimeType: row.mime_type,
  };
}

/** Seeded avatar ids, for the insert-once stability assertion. */
async function seededAvatarIds(db: Kysely<DB>,): Promise<string[]> {
  const rows = await db
    .selectFrom("character_avatars",)
    .select("id",)
    .orderBy("id", "asc",)
    .execute();

  return rows.map((r,) => r.id);
}

afterAll(() => {
  // Per-test fixture roots are removed by each test's finally; nothing shared
  // outlives this file.
},);

describeReal("Avatar Dogfood E2E — fresh DB seeds the promoted art", () => {
  describe.each([["webp",], ["png",],],)("master format: %s", (master,) => {
    test("wipe → seed → promoted bytes byte-equal the committed master; unpromoted keep the SVG placeholder; reseed changes nothing", async () => {
      const fx = await promoteElara(master as PromoteMasterFormat,);
      let handle: TestDb | null = null;
      try {
        // Steps 5–6: wipe (fresh :memory: DB + empty upload dir) and boot the
        // production seeder.
        handle = await createTestDb();
        const first = await seedCharacterTemplates(handle.db, fx.charactersConfig, null, fx.uploadDir,);
        expect(first.errors,).toEqual([],);
        expect(first.created,).toBe(TEMPLATES.length,);

        // Step 7a — promoted character: primary avatar bytes == committed file.
        const masterBytes = readFileSync(fx.masterAbs,);
        const promoted = await primaryAvatarBytes(handle.db, fx.uploadDir, "Elara Nightwhisper",);
        expect(promoted.bytes.equals(masterBytes,),).toBe(true,);
        expect(promoted.mimeType,).toBe(master === "webp" ? "image/webp" : "image/png",);

        // Step 7b — unpromoted character (Morgan ships `avatar: { type:
        // "default" }` in CHARACTERS_DEFAULTS): deterministic SVG placeholder.
        const unpromoted = await primaryAvatarBytes(handle.db, fx.uploadDir, "Detective Morgan",);
        expect(unpromoted.bytes.equals(PLACEHOLDER.buffer,),).toBe(true,);
        expect(unpromoted.mimeType,).toBe("image/svg+xml",);

        // Insert-once: a second boot seeds nothing new and keeps every id.
        const idsBefore = await seededAvatarIds(handle.db,);
        const second = await seedCharacterTemplates(handle.db, fx.charactersConfig, null, fx.uploadDir,);
        expect(second.created,).toBe(0,);
        expect(second.skipped,).toBe(TEMPLATES.length,);
        expect(await seededAvatarIds(handle.db,),).toEqual(idsBefore,);
      } finally {
        if (handle) { await destroyTestDb(handle,); }
        rmSync(fx.repoRoot, { recursive: true, force: true, },);
        rmSync(fx.uploadDir, { recursive: true, force: true, },);
      }
    });
  },);
},);
