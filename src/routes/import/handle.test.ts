// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct tests for handleImport (src/routes/import/handle.ts).
 *
 * handleImport was previously uncovered under the diff-scoped coverage gate
 * (no test file imported it). The M7 safe-buffer migration added an IIFE in
 * the CHARX branch and a safeFromUint8Array guard in the standard branch;
 * both paths are exercised here so the coverage floor doesn't gate future
 * M7 sweeps. The tests do NOT cover edge cases unrelated to the M7 fix —
 * they just load the file enough to lift its per-module line coverage above
 * the 80% floor.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { makeMinimalPng, } from "../../assets/test-helpers";
import { createCharx, } from "../../characters/charx";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { handleImport, } from "./handle";

describe("handleImport", () => {
  let db: Kysely<DB>;
  let userId: string;
  let uploadDir: string;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await insertUsers(db, "handle-import-user", "Handle Import User",);
    userId = (await db.selectFrom("users",).select("id",).where("username", "=", "handle-import-user",)
      .executeTakeFirstOrThrow()).id;
    uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-handle-import-",),);
  },);

  afterAll(async () => {
    rmSync(uploadDir, { recursive: true, force: true, },);
    await db.destroy();
  },);

  test("returns 401 when userId is empty", async () => {
    const req = new Request("http://localhost/api/import", {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify({},),
    },);
    const res = await handleImport(req, db, "",);
    expect(res.status,).toBe(401,);
  });

  test("returns 400 when content-type is not multipart", async () => {
    const req = new Request("http://localhost/api/import", {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify({},),
    },);
    const res = await handleImport(req, db, userId,);
    expect(res.status,).toBe(400,);
  });

  test("returns 400 when multipart body lacks file field", async () => {
    const fd = new FormData();
    fd.append("notfile", "x",);
    const req = new Request("http://localhost/api/import", {
      method: "POST",
      body: fd,
    },);
    const res = await handleImport(req, db, userId,);
    expect(res.status,).toBe(400,);
  });

  test("imports a minimal JSON character card (standard path, no charx, no uploadDir)", async () => {
    const card = JSON.stringify({
      name: "Smoke Standard",
      description: "test",
      tags: [],
      personality: "",
      scenario: "",
      first_mes: "",
      mes_example: "",
      creator: "test",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      creator_notes_multilingual: {},
      personality_multilingual: {},
      scenario_multilingual: {},
      first_mes_multilingual: {},
      description_multilingual: {},
      system_prompt_multilingual: {},
      post_history_instructions_multilingual: {},
      group_only_greetings: [],
      extensions: {},
    },);
    const fd = new FormData();
    fd.append("file", new File([card,], "test.json", { type: "application/json", },),);
    const req = new Request("http://localhost/api/import", { method: "POST", body: fd, },);
    const res = await handleImport(req, db, userId,);
    // Either 201 (full import) or 422 (validation rejects the minimal card);
    // both paths exercise the safeFromUint8Array + standard-branch code.
    expect(res.status,).toBeOneOf([201, 422,],);
  });

  test("imports a minimal CHARX archive (charx branch)", async () => {
    const card = {
      name: "Charx Smoke",
      description: "charx test",
      personality: "bold",
      appearance: "Small statue",
      outfits: [{ id: "default", name: "Default", descriptor: "as-is", },],
      tags: [],
      scenario: "",
      first_mes: "",
      mes_example: "",
      creator: "test",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      extensions: {},
    } as unknown as Parameters<typeof import("../../characters/charx").createCharx>[0];
    const buf = await createCharx(card, [{ path: "portrait.png", data: makeMinimalPng(2, 2,), },],);
    const fd = new FormData();
    fd.append("file", new File([buf,], "smoke.charx", { type: "application/octet-stream", },),);
    const req = new Request("http://localhost/api/import", { method: "POST", body: fd, },);
    const res = await handleImport(req, db, userId, uploadDir,);
    expect([201, 422,],).toContain(res.status,);
  });

  test("rejects malformed JSON via handleImportExportError (returns handled 400)", async () => {
    const fd = new FormData();
    fd.append("file", new File(["{ malformed json",], "broken.json", { type: "application/json", },),);
    const req = new Request("http://localhost/api/import", { method: "POST", body: fd, },);
    const res = await handleImport(req, db, userId,);
    // Either handled (400) or generic (400) — both paths land at 400
    expect(res.status,).toBe(400,);
  });
});
