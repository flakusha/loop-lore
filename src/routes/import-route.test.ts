// src/routes/import-route.test.ts
//
// HTTP-level tests for POST /api/actors/import (multipart, multi-format).
// Complements import.test.ts, which covers only the internal lorebook ops.

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { AuthConfig, } from "../config/schema";
import type { DB, } from "../db/schema";
import { resetSoloUserCache, } from "../middleware/auth";
import { createTestDb, } from "../test-utils/create-test-db";
import { importRoutes, } from "./import";

/**
 * Build the app with solo-mode auth (required=false) so no session/JWT is
 * needed — authenticate() falls back to the auto-created demo user.
 * @param db
 */
function createApp(db: Kysely<DB>,): Elysia {
  const auth: AuthConfig = {
    required: false,
    registrationOpen: false,
    sessionTimeoutHours: 24,
    maxSessionsPerUser: 5,
    demoUsername: "demo",
    demoAutoSetup: false,
    jwtSecret: "test-secret",
  };
  return new Elysia({ name: "test-import-route", },)
    .use(importRoutes({ database: db, config: { auth, }, },),);
}

// Standard CCv2 envelope; parser detects format via spec: "chara_card_v2".
const ccv2Card = JSON.stringify({
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Import Test Char",
    description: "A character imported via multipart",
    personality: "brave",
    scenario: "In a cave",
    first_mes: "Welcome!",
    mes_example: "Example dialogue",
    creator: "test-suite",
    character_version: "1.5",
    alternate_greetings: ["Alternative greeting",],
    tags: ["ranger", "demo",],
  },
},);

/**
 * @param file
 */
function multipartRequest(file?: File,): Request {
  const form = new FormData();
  if (file) {
    form.append("file", file,);
  } else {
    // Still multipart, but no "file" field.
    form.append("note", "no file here",);
  }
  return new Request("http://localhost/api/actors/import", {
    method: "POST",
    body: form,
  },);
}

describe("importRoutes — POST /api/actors/import", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    resetSoloUserCache();
    const created = await createTestDb();
    db = created.db;
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("imports a CCv2 JSON card and creates an actor", async () => {
    const app = createApp(db,);
    const res = await app.handle(
      multipartRequest(new File([ccv2Card,], "card.json", { type: "application/json", },),),
    );

    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { name: string; format: string; warnings: string[] };
    expect(body.name,).toBe("Import Test Char",);
    expect(body.format,).toBe("ccv2",);
    expect(Array.isArray(body.warnings,),).toBe(true,);

    const actor = await db
      .selectFrom("actors",)
      .selectAll()
      .where("display_name", "=", "Import Test Char",)
      .executeTakeFirst();
    expect(actor,).toBeDefined();
    expect(actor?.description,).toBe("A character imported via multipart",);
    expect(actor?.personality,).toBe("brave",);
    expect(actor?.scenario,).toBe("In a cave",);
    expect(actor?.creator,).toBe("test-suite",);
    expect(actor?.character_version,).toBe("1.5",);
    expect(actor?.import_spec,).toBe("ccv2",);
    expect(actor?.data_source_format,).toBe("ccv2",);
    expect(actor?.user_id,).toBeDefined();
  });

  test("returns 400 when the file field is missing", async () => {
    const app = createApp(db,);
    const res = await app.handle(multipartRequest(),);
    expect(res.status,).toBe(400,);
  });

  test("returns 400 for an unparseable file", async () => {
    const app = createApp(db,);
    const res = await app.handle(
      multipartRequest(new File(["this is not a character card",], "bad.json", { type: "application/json", },),),
    );
    expect(res.status,).toBe(400,);
  });

  test("returns 400 for non-multipart content-type", async () => {
    const app = createApp(db,);
    const res = await app.handle(
      new Request("http://localhost/api/actors/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ purpose: "no file", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });
});
