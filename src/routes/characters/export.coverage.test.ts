// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for character export routes (json/ccv2/ccv3/yaml/toml/png/charx).
 *
 * Exercises auth/visibility gating, every format branch, raw-source
 * fidelity for yaml/toml stores, malformed alternate_greetings, and
 * param validation — all against an isolated :memory: database.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { mkdir, rm, writeFile, } from "node:fs/promises";
import { join, } from "node:path";
import type { ActorType, AgentType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { exportRoutes, } from "./export";

describe("characters exportRoutes coverage", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const stranger = uid();
  const actorId = uid();
  const publicActorId = uid();
  const rawYamlId = uid();
  const rawTomlId = uid();
  const brokenGreetingsId = uid();

  /**
   * Build the route app with the given auth context.
   * @param userId authenticated user or null for anonymous
   * @param userRole role string or null
   */
  function makeApp(userId: string | null, userRole: string | null,): Elysia {
    return new Elysia({ name: `test-char-export-${userId ?? "anon"}-${userRole ?? "none"}`, },)
      .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
      .use(exportRoutes({ database: db, },),) as unknown as Elysia;
  }
  let app: Elysia;
  const fixtureDir = (): string => join(process.cwd(), ".tmp", "char-export-cover",);

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    const stamp = Date.now().toString(36,);
    await db.insertInto("users",).values({
      id: owner,
      username: `exp-owner-${stamp}`,
      display_name: "Export Owner",
      password_hash: "h",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    await db.insertInto("users",).values({
      id: stranger,
      username: `exp-stranger-${stamp}`,
      display_name: "Export Stranger",
      password_hash: "h",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();

    const base = {
      actor_type: "character" as ActorType,
      user_id: owner,
      owner_id: owner,
      agent_type: "none" as AgentType,
      description: "A brave tester",
      personality: "Curious and kind",
      scenario: "A tavern at dusk",
      welcome_message: "Well met!",
      mes_example: "Example dialogue",
      system_prompt: "You are Aldric",
      alternate_greetings: JSON.stringify(["Hi there", "Welcome back",],),
      settings: "{}",
      format_version: 0,
      import_spec: "{}",
    };
    await db.insertInto("actors",).values({
      ...base,
      id: actorId,
      display_name: "Aldric the Brave",
      visibility: "private",
    },).execute();
    await db.insertInto("actors",).values({
      ...base,
      id: publicActorId,
      display_name: "Public Hero",
      visibility: "public",
    },).execute();
    await db.insertInto("actors",).values({
      ...base,
      id: rawYamlId,
      display_name: "Raw Yaml",
      visibility: "private",
      data_source_format: "yaml",
      data_raw: "name: Raw Yaml\ndescription: kept verbatim\n",
    },).execute();
    await db.insertInto("actors",).values({
      ...base,
      id: rawTomlId,
      display_name: "Raw Toml",
      visibility: "private",
      data_source_format: "toml",
      data_raw: 'name = "Raw Toml"\n',
    },).execute();
    await db.insertInto("actors",).values({
      ...base,
      id: brokenGreetingsId,
      display_name: "Broken Greetings",
      visibility: "private",
      alternate_greetings: "not-json{{{",
    },).execute();
    app = makeApp(owner, "user",);
  },);

  afterAll(async () => {
    await db.destroy();
    await rm(fixtureDir(), { recursive: true, force: true, },);
  },);

  test("404 for unknown actors and actors without access", async () => {
    const missing = await app.handle(
      new Request(`http://localhost/api/actors/${uid()}/export`,),
    );
    expect(missing.status,).toBe(404,);
    const outsider = makeApp(stranger, "user",);
    const denied = await outsider.handle(
      new Request(`http://localhost/api/actors/${actorId}/export`,),
    );
    expect(denied.status,).toBe(404,);
    const anon = makeApp(null, null,);
    const anonDenied = await anon.handle(
      new Request(`http://localhost/api/actors/${actorId}/export`,),
    );
    expect(anonDenied.status,).toBe(404,);
    const badId = await app.handle(
      new Request("http://localhost/api/actors/not-a-uuid/export",),
    );
    expect(badId.status,).toBe(422,);
  });

  test("public actors export for strangers; admins bypass ownership", async () => {
    const outsider = makeApp(stranger, "user",);
    const pub = await outsider.handle(
      new Request(`http://localhost/api/actors/${publicActorId}/export`,),
    );
    expect(pub.status,).toBe(200,);
    const admin = makeApp(stranger, "admin",);
    const byAdmin = await admin.handle(
      new Request(`http://localhost/api/actors/${actorId}/export`,),
    );
    expect(byAdmin.status,).toBe(200,);
  });

  test("default and ccv3 formats return character-card JSON", async () => {
    for (const suffix of ["", "?format=json", "?format=ccv3", "?format=ccv2", "?format=bogus",]) {
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/export${suffix}`,),
      );
      expect(res.status,).toBe(200,);
      expect(res.headers.get("content-type",),).toContain("application/json",);
      expect(res.headers.get("content-disposition",),).toContain(".json",);
      const text = await res.text();
      expect(text,).toContain("Aldric the Brave",);
    }
  });

  test("yaml and toml formats return text attachments", async () => {
    const yaml = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/export?format=yaml`,),
    );
    expect(yaml.status,).toBe(200,);
    expect(yaml.headers.get("content-type",),).toContain("text/yaml",);
    expect(yaml.headers.get("content-disposition",),).toContain(".yaml",);
    expect(await yaml.text(),).toContain("Aldric the Brave",);
    const toml = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/export?format=toml`,),
    );
    expect(toml.status,).toBe(200,);
    expect(toml.headers.get("content-type",),).toContain("text/plain",);
    expect(toml.headers.get("content-disposition",),).toContain(".toml",);
    expect(await toml.text(),).toContain("Aldric the Brave",);
  });

  test("yaml/toml raw sources return verbatim for fidelity", async () => {
    const yaml = await app.handle(
      new Request(`http://localhost/api/actors/${rawYamlId}/export?format=yaml`,),
    );
    expect(yaml.status,).toBe(200,);
    expect(await yaml.text(),).toBe("name: Raw Yaml\ndescription: kept verbatim\n",);
    const toml = await app.handle(
      new Request(`http://localhost/api/actors/${rawTomlId}/export?format=toml`,),
    );
    expect(toml.status,).toBe(200,);
    expect(await toml.text(),).toBe('name = "Raw Toml"\n',);
  });

  test("png format returns a PNG attachment", async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/export?format=png`,),
    );
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toBe("image/png",);
    expect(res.headers.get("content-disposition",),).toContain(".png",);
    const bytes = new Uint8Array(await res.arrayBuffer(),);
    expect([...bytes.slice(0, 4,),],).toEqual([137, 80, 78, 71,],);
  });

  test("charx format returns a zip without linked assets", async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/export?format=charx`,),
    );
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toBe("application/zip",);
    expect(res.headers.get("content-disposition",),).toContain(".charx",);
    const bytes = new Uint8Array(await res.arrayBuffer(),);
    expect([...bytes.slice(0, 2,),],).toEqual([80, 75,],);
  });

  test("malformed alternate_greetings falls back instead of failing", async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${brokenGreetingsId}/export`,),
    );
    expect(res.status,).toBe(200,);
    expect(await res.text(),).toContain("Broken Greetings",);
  });

  test("charx bundles linked asset files", async () => {
    const dir = fixtureDir();
    await mkdir(dir, { recursive: true, },);
    const storagePath = join(dir, "portrait.png",);
    await writeFile(storagePath, Buffer.from([137, 80, 78, 71, 1, 2, 3,],),);
    const assetId = uid();
    await db.insertInto("assets",).values({
      id: assetId,
      owner_id: owner,
      filename: "portrait.png",
      mime_type: "image/png",
      asset_type: "image",
      size_bytes: 7,
      storage_path: storagePath,
    },).execute();
    await db.insertInto("asset_links",).values({
      asset_id: assetId,
      entity_type: "actor",
      entity_id: actorId,
    },).execute();
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/export?format=charx`,),
    );
    expect(res.status,).toBe(200,);
    const bytes = new Uint8Array(await res.arrayBuffer(),);
    expect([...bytes.slice(0, 2,),],).toEqual([80, 75,],);
    expect(bytes.length,).toBeGreaterThan(0,);
  });
});
