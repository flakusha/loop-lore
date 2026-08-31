/**
 * Tests for bulk data export route (POST /api/export)
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import JSZip from "jszip";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { exportRoutes, } from "./export";

/**
 * @param db
 */
function createApp(db: Kysely<DB>,): Elysia {
  return new Elysia({ name: "test-export", },)
    .use(exportRoutes({ database: db, },),);
}

/**
 * @param app
 * @param body
 */
async function postExport(
  app: Elysia,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return app.handle(
    new Request("http://localhost/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/**
 * @param res
 */
async function parseZip(res: Response,): Promise<Record<string, string>> {
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf,);
  const files: Record<string, string> = {};
  await Promise.all(
    Object.keys(zip.files,).map(async (path,) => {
      const file = zip.files[path];
      if (file && !file.dir) {
        files[path] = await file.async("text",);
      }
    },),
  );
  return files;
}

/**
 * @param files
 * @param path
 */
function readJson(files: Record<string, string>, path: string,): Record<string, unknown> {
  const raw = files[path];
  if (!raw) { throw new Error(`File not found in zip: ${path}`,); }
  return JSON.parse(raw,) as Record<string, unknown>;
}

describe("exportRoutes", () => {
  let db: Kysely<DB>;
  let userId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();

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

    await db
      .insertInto("actors",)
      .values({
        id: userId,
        actor_type: "user",
        display_name: "Test User",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("export returns ZIP with application/zip content type", async () => {
    const app = createApp(db,);
    const res = await postExport(app, { include: [], },);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("Content-Type",),).toBe("application/zip",);
  });

  test("manifest.json has version, exported_by, format_version, and checksums", async () => {
    const app = createApp(db,);
    const res = await postExport(app, { include: [], },);
    const files = await parseZip(res,);

    const manifest = readJson(files, "manifest.json",);
    expect(manifest.version,).toBe("1.0",);
    expect(manifest.exported_by,).toBeDefined();
    expect(manifest.format_version,).toBe("1.0",);
    expect(typeof manifest.checksums,).toBe("object",);
  });

  test("metadata/ folder contains export-info.json and schema-version.json", async () => {
    const app = createApp(db,);
    const res = await postExport(app, { include: [], },);
    const files = await parseZip(res,);

    const exportInfo = readJson(files, "metadata/export-info.json",);
    expect(exportInfo.exported_by,).toBeDefined();
    expect(exportInfo.includes,).toEqual([],);

    const schemaVersion = readJson(files, "metadata/schema-version.json",);
    expect(schemaVersion.schema_version,).toBe("1.0",);
    expect(schemaVersion.export_format_version,).toBe("1.0",);
  });

  test("characters export includes CCv3 card with correct fields", async () => {
    const charId = uid();
    await db
      .insertInto("actors",)
      .values({
        id: charId,
        actor_type: "character",
        display_name: "Lyra Test",
        description: "A test character",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    const app = createApp(db,);
    const res = await postExport(app, { include: ["characters",], },);
    expect(res.status,).toBe(200,);

    const files = await parseZip(res,);
    expect(files["characters/lyra_test.json"],).toBeDefined();

    const charJson = readJson(files, "characters/lyra_test.json",);
    expect(charJson.spec,).toBe("chara_card_v3",);
    const data = charJson.data as Record<string, unknown>;
    expect(data.name,).toBe("Lyra Test",);
    expect(data.description,).toBe("A test character",);

    const manifest = readJson(files, "manifest.json",);
    expect((manifest.contents as Record<string, number>).characters,).toBe(1,);
  });

  test("chats export includes chat data with messages array", async () => {
    const chatId = uid();
    await db
      .insertInto("chats",)
      .values({
        id: chatId,
        name: "Test Chat",
        type: "direct",
        mode: "direct",
        created_by: userId,
      },)
      .execute();

    const app = createApp(db,);
    const res = await postExport(app, { include: ["chats",], },);
    expect(res.status,).toBe(200,);

    const files = await parseZip(res,);
    expect(files["chats/test_chat.json"],).toBeDefined();

    const chatData = readJson(files, "chats/test_chat.json",);
    expect(chatData.name,).toBe("Test Chat",);
    expect(chatData.messages,).toBeInstanceOf(Array,);

    const manifest = readJson(files, "manifest.json",);
    expect((manifest.contents as Record<string, number>).chats,).toBe(1,);
  });

  test("worlds export includes world data scoped to owner", async () => {
    const worldId = uid();
    await db
      .insertInto("worlds",)
      .values({
        id: worldId,
        owner_id: userId,
        name: "Test World",
        description: "A test world",
        difficulty_modifier: 1,
        difficulty_reroll: "none",
        difficulty_state: "normal",
      },)
      .execute();

    const app = createApp(db,);
    const res = await postExport(app, { include: ["worlds",], },);
    expect(res.status,).toBe(200,);

    const files = await parseZip(res,);
    expect(files[`worlds/${worldId}.json`],).toBeDefined();

    const worldData = readJson(files, `worlds/${worldId}.json`,);
    expect(worldData.name,).toBe("Test World",);
    expect(worldData.description,).toBe("A test world",);

    const manifest = readJson(files, "manifest.json",);
    expect((manifest.contents as Record<string, number>).worlds,).toBe(1,);
  });

  test("assets export returns empty count when no assets exist", async () => {
    const app = createApp(db,);
    const res = await postExport(app, { include: ["assets",], },);
    expect(res.status,).toBe(200,);

    const files = await parseZip(res,);
    expect(Object.keys(files,).some((p,) => p.startsWith("assets/",) && p !== "assets/"),).toBe(false,);

    const manifest = readJson(files, "manifest.json",);
    expect((manifest.contents as Record<string, number>).assets,).toBe(0,);
  });

  test("checksums are sha256: prefixed 64-char hex strings", async () => {
    const app = createApp(db,);
    const res = await postExport(app, { include: [], },);
    const files = await parseZip(res,);

    const manifest = readJson(files, "manifest.json",);
    const checksums = manifest.checksums as Record<string, string>;
    expect(checksums["metadata/export-info.json"],).toMatch(/^sha256:[a-f0-9]{64}$/,);
    expect(checksums["metadata/schema-version.json"],).toMatch(/^sha256:[a-f0-9]{64}$/,);
  });

  test("include filter exports only requested data types", async () => {
    const app = createApp(db,);
    const res = await postExport(app, { include: ["characters",], },);
    const files = await parseZip(res,);

    const manifest = readJson(files, "manifest.json",);
    const contents = manifest.contents as Record<string, number>;
    expect(contents.characters,).toBeDefined();
    expect(contents.chats,).toBeUndefined();
    expect(contents.worlds,).toBeUndefined();
    expect(contents.assets,).toBeUndefined();
  });

  test("empty body defaults to characters+chats only", async () => {
    const app = createApp(db,);
    const res = await postExport(app,);
    const files = await parseZip(res,);

    const manifest = readJson(files, "manifest.json",);
    const contents = manifest.contents as Record<string, number>;
    expect(contents.characters,).toBeDefined();
    expect(contents.chats,).toBeDefined();
    expect(contents.worlds,).toBeUndefined();
    expect(contents.assets,).toBeUndefined();
  });

  test("locations export includes per-world location JSON scoped to owner", async () => {
    const worldId = uid();
    await db
      .insertInto("worlds",)
      .values({
        id: worldId,
        owner_id: userId,
        name: "Loc Route World",
        difficulty_modifier: 1,
        difficulty_reroll: "none",
        difficulty_state: "normal",
      },)
      .execute();
    const locId = uid();
    await db
      .insertInto("locations",)
      .values({
        id: locId,
        world_id: worldId,
        name: "Gatehouse",
      },)
      .execute();

    const app = createApp(db,);
    const res = await postExport(app, { include: ["locations",], },);
    expect(res.status,).toBe(200,);
    const files = await parseZip(res,);

    const path = `locations/${worldId}/${locId}.json`;
    expect(files[path],).toBeDefined();
    const loc = readJson(files, path,);
    expect(loc.name,).toBe("Gatehouse",);

    const manifest = readJson(files, "manifest.json",);
    expect((manifest.contents as Record<string, number>).locations,).toBeGreaterThanOrEqual(1,);
  });

  test("story export includes a world bundle", async () => {
    const worldId = uid();
    await db
      .insertInto("worlds",)
      .values({
        id: worldId,
        owner_id: userId,
        name: "Route Story World",
        description: "A world",
        difficulty_modifier: 1,
        difficulty_reroll: "none",
        difficulty_state: "normal",
      },)
      .execute();

    const app = createApp(db,);
    const res = await postExport(app, { include: ["story",], },);
    expect(res.status,).toBe(200,);
    const files = await parseZip(res,);

    const bundle = readJson(files, `story/${worldId}.json`,);
    const world = bundle.world as { name: string };
    expect(world.name,).toBe("Route Story World",);
    expect(bundle.locations as unknown[],).toBeInstanceOf(Array,);

    const manifest = readJson(files, "manifest.json",);
    expect((manifest.contents as Record<string, number>).story,).toBeGreaterThanOrEqual(1,);
  });
});
