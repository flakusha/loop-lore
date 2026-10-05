// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for the edited asset's owner id.
 *
 * DEFECT: `apply.ts` passed `opts.actorId` straight into
 * `createAsset({ input: { ownerId } })`. `assets.owner_id` is
 * `NOT NULL REFERENCES users.id`, so an actor id is never a legal owner — it
 * trips the FK when no user holds that id, and silently hands the edit to an
 * unrelated user when one does.
 *
 * These drive the REAL `createAsset` against a migrated schema, so the FK is
 * actually enforced and a regression surfaces as a `SQLiteError` rather than
 * as a hand-rolled assertion about what the code "should" have passed. Only
 * the two out-of-process edges are stubbed: the config loader (no SD provider
 * is configured in a test environment) and global `fetch` (no provider at the
 * other end). `mock.module` is process-global, hence the ISOLATED gate.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { createAsset, } from "../../assets/service";
import { makeMinimalPng, } from "../../assets/test-helpers";
import * as realConfigLoad from "../../config/load";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { EditTemplate, ParsedCommand, } from "../image-edit-commands";
import type { applyEdit as applyEditFn, } from "./apply";
import type { ImageEditServiceContext, } from "./types";

const OWNER_USER = "user-edit-owner";
/** Owned character: `owner_id` set, `user_id` NULL. Actor id is NOT a user. */
const OWNED_ACTOR = "actor-edit-owned";
/** The requester's own persona: `owner_id` NULL, `user_id` set. */
const PERSONA_ACTOR = "actor-edit-persona";
/** Both columns NULL — no user can own an asset for it. */
const ORPHAN_ACTOR = "actor-edit-orphan";

const SOURCE_PNG = makeMinimalPng(4, 4,);
const RESULT_PNG = makeMinimalPng(5, 5,);

let applyEdit: typeof applyEditFn;
let db: Kysely<DB>;
let sqlite: Database;
let uploadDir = "";
/** Source asset every edit starts from; owned by OWNER_USER. */
let sourceAssetId = "";

const TEMPLATE: EditTemplate = {
  id: "apply-owner-probe",
  name: "Apply Owner Probe",
  intent: "modify_background",
  promptModifier: "make it brighter",
  denoisingStrength: 0.4,
};

const PARSED: ParsedCommand = {
  intent: "modify_background",
  confidence: 1,
  originalText: "make it brighter",
  parameters: {},
};

const SD_PROVIDER = {
  name: "stub-sd",
  label: "Stub SD",
  apiFamily: "sdapi",
  purpose: "edit",
  baseUrl: "http://127.0.0.1:7860",
  timeout: 1_000,
  generationTimeout: 1_000,
  defaults: { steps: 20, cfgScale: 7, sampler: "euler", width: 512, height: 512, },
};

if (ISOLATED) {
  uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-apply-owner-",),);

  mock.module("../../config/load", () => ({
    ...realConfigLoad,
    loadConfig: () => ({
      assets: { uploadDir, },
      generation: { providers: { sd: [SD_PROVIDER,], }, },
    }),
  }),);

  // `safeFetch` calls the global `fetch`; stubbing that keeps the whole
  // utils/safe-fetch path (headers, timeout, size cap) exercised for real.
  globalThis.fetch = (async () =>
    Response.json({ images: [RESULT_PNG.toString("base64",),], },)) as unknown as typeof fetch;

  // Dynamic import is required: `mock.module` must be registered BEFORE the
  // SUT module is evaluated, which a static import cannot guarantee.
  ({ applyEdit, } = await import("./apply"));
}

describeOrSkip("applyEdit asset ownership", () => {
  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "edit-owner", "Edit Owner", { id: OWNER_USER as never, },);
    await insertActors(db, "Owned Character", { id: OWNED_ACTOR, owner_id: OWNER_USER, },);
    await insertActors(db, "Persona", { id: PERSONA_ACTOR, user_id: OWNER_USER, },);
    await insertActors(db, "Orphan", { id: ORPHAN_ACTOR, },);

    const { asset, } = await createAsset({
      database: db,
      input: {
        ownerId: OWNER_USER,
        filename: "source.png",
        mimeType: "image/png",
        assetType: "image",
        sizeBytes: SOURCE_PNG.length,
        buffer: SOURCE_PNG,
        altText: "source",
        dedupe: false,
      },
      uploadDir,
    },);

    sourceAssetId = asset.id;
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
    rmSync(uploadDir, { recursive: true, force: true, },);
  },);

  /**
   * @param actorId - Actor id threaded through `ApplyEditArgs.opts.actorId`
   * @returns The service context `applyEdit` dispatches against
   */
  function makeThisL(): ImageEditServiceContext {
    return { db, uploadDir, } as unknown as ImageEditServiceContext;
  }

  /**
   * @param actorId - Actor whose edited asset is under test
   * @returns The persisted row for the edited asset
   */
  async function editAndReadAsset(actorId: string,): Promise<{ id: string; owner_id: string }> {
    const resultAssetId = await applyEdit({
      thisL: makeThisL(),
      opts: { sourceAssetId, template: TEMPLATE, denoisingStrength: 0.4, parsed: PARSED, actorId, },
    },);

    return db.selectFrom("assets",).select(["id", "owner_id",],).where("id", "=", resultAssetId,)
      .executeTakeFirstOrThrow();
  }

  test("persists the edit under the actor's owning user, not the actor id", async () => {
    const row = await editAndReadAsset(OWNED_ACTOR,);

    // The actor id is not a `users` row, so writing it verbatim would have
    // died on the FK before reaching this assertion.
    expect(row.owner_id,).toBe(OWNER_USER,);
    expect(row.owner_id,).not.toBe(OWNED_ACTOR,);

    const owner = await db.selectFrom("users",).select("id",).where("id", "=", row.owner_id,)
      .executeTakeFirstOrThrow();

    expect(owner.id,).toBe(OWNER_USER,);
  });

  test("falls back to user_id for a persona actor (owner_id NULL)", async () => {
    const row = await editAndReadAsset(PERSONA_ACTOR,);

    expect(row.owner_id,).toBe(OWNER_USER,);
    expect(row.owner_id,).not.toBe(PERSONA_ACTOR,);
  });

  test("throws rather than writing an asset for an actor with no owning user", async () => {
    await expect(
      applyEdit({
        thisL: makeThisL(),
        opts: {
          sourceAssetId,
          template: TEMPLATE,
          denoisingStrength: 0.4,
          parsed: PARSED,
          actorId: ORPHAN_ACTOR,
        },
      },),
    ).rejects.toThrow("no owning user",);
  });
},);
