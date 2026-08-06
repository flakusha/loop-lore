/**
 * Tests for the shared per-type export routines and the SSE asset-manifest
 * sink (the path the plain export route does not exercise).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import JSZip from "jszip";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import {
  exportCharactersToZip,
  exportChatsToZip,
  type ExportItem,
  exportLocationsToZip,
  exportStoryToZip,
  exportWorldsToZip,
} from "./export-shared";

describe("export-shared routines", () => {
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
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  async function insertCharacter(id: string, name: string,): Promise<void> {
    await db
      .insertInto("actors",)
      .values({
        id,
        actor_type: "character",
        display_name: name,
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
  }

  test("characters routine writes files, checksums, counts, and onItem entries", async () => {
    const charId = uid();
    await insertCharacter(charId, "Shared Name",);

    const zip = new JSZip();
    const checksums: Record<string, string> = {};
    const counts: Record<string, number> = {};
    const items: ExportItem[] = [];

    await exportCharactersToZip({
      database: db,
      userId,
      zip,
      checksums,
      format: "json",
      counts,
      onItem: (item,) => {
        items.push(item,);
      },
    },);

    expect(counts.characters,).toBe(1,);
    expect(zip.file("characters/shared_name.json",),).toBeDefined();
    expect(checksums["characters/shared_name.json"],).toMatch(/^sha256:[a-f0-9]{64}$/,);
    expect(items,).toHaveLength(1,);
    expect(items[0],).toMatchObject({
      id: charId,
      type: "character",
      name: "Shared Name",
      format: "json",
      filename: "shared_name.json",
      size: expect.any(Number,),
    },);
  });

  test("characters PNG routine collects size from exportToPng buffer", async () => {
    const charId = uid();
    await insertCharacter(charId, "Png Char",);

    const zip = new JSZip();
    const checksums: Record<string, string> = {};
    const counts: Record<string, number> = {};
    const items: ExportItem[] = [];

    await exportCharactersToZip({
      database: db,
      userId,
      zip,
      checksums,
      format: "png",
      counts,
      onItem: (item,) => {
        items.push(item,);
      },
    },);

    expect(zip.file("characters/png_char.png",),).toBeDefined();
    const pngItem = items.find((i,) => i.name === "Png Char");
    expect(pngItem?.filename,).toBe("png_char.png",);
    expect(pngItem?.size,).toBeGreaterThan(0,);
    // PNG is binary — checksum still sha256
    expect(checksums["characters/png_char.png"],).toMatch(/^sha256:[a-f0-9]{64}$/,);
  });

  test("chats routine filters by chat ids and reports message metadata", async () => {
    const chatId = uid();
    await db
      .insertInto("chats",)
      .values({
        id: chatId,
        name: "SSE Chat",
        type: "direct",
        mode: "direct",
        created_by: userId,
      },)
      .execute();

    const zip = new JSZip();
    const checksums: Record<string, string> = {};
    const counts: Record<string, number> = {};
    const items: ExportItem[] = [];

    await exportChatsToZip({
      database: db,
      userId,
      zip,
      checksums,
      format: "json",
      chatIds: [chatId,],
      counts,
      onItem: (item,) => {
        items.push(item,);
      },
    },);

    expect(counts.chats,).toBe(1,);
    expect(zip.file("chats/sse_chat.json",),).toBeDefined();
    expect(items[0]?.metadata,).toMatchObject({
      message_count: 0,
      chat_type: "direct",
      chat_mode: "direct",
    },);
  });

  test("worlds routine scopes rows to owner and reports entries", async () => {
    const worldId = uid();
    await db
      .insertInto("worlds",)
      .values({
        id: worldId,
        owner_id: userId,
        name: "SSE World",
        description: "A world",
        difficulty_modifier: 1,
        difficulty_reroll: "none",
        difficulty_state: "normal",
      },)
      .execute();

    const zip = new JSZip();
    const checksums: Record<string, string> = {};
    const counts: Record<string, number> = {};
    const items: ExportItem[] = [];

    await exportWorldsToZip({
      database: db,
      userId,
      zip,
      checksums,
      format: "json",
      counts,
      onItem: (item,) => {
        items.push(item,);
      },
    },);

    expect(counts.worlds,).toBe(1,);
    expect(zip.file(`worlds/${worldId}.json`,),).toBeDefined();
    expect(items[0]?.name,).toBe("SSE World",);
  });

  test("locations routine writes per-world files scoped to owner", async () => {
    const worldId = uid();
    await db
      .insertInto("worlds",)
      .values({
        id: worldId,
        owner_id: userId,
        name: "Loc World",
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
        name: "Throne Room",
      },)
      .execute();

    const zip = new JSZip();
    const checksums: Record<string, string> = {};
    const counts: Record<string, number> = {};
    const items: ExportItem[] = [];

    await exportLocationsToZip({
      database: db,
      userId,
      zip,
      checksums,
      format: "json",
      counts,
      onItem: (item,) => {
        items.push(item,);
      },
    },);

    expect(counts.locations,).toBe(1,);
    expect(zip.file(`locations/${worldId}/${locId}.json`,),).toBeDefined();
    expect(items[0],).toMatchObject({
      id: locId,
      type: "location",
      name: "Throne Room",
      format: "json",
    },);
    expect(checksums[`locations/${worldId}/${locId}.json`],).toMatch(/^sha256:[a-f0-9]{64}$/,);
  });

  test("story routine writes a round-trippable world bundle", async () => {
    const worldId = uid();
    await db
      .insertInto("worlds",)
      .values({
        id: worldId,
        owner_id: userId,
        name: "Story World",
        description: "A world",
        difficulty_modifier: 1,
        difficulty_reroll: "none",
        difficulty_state: "normal",
      },)
      .execute();
    // quests.creator_id references actors.id
    await insertCharacter(userId, "Test User",);
    const locId = uid();
    await db
      .insertInto("locations",)
      .values({
        id: locId,
        world_id: worldId,
        name: "Dungeon",
      },)
      .execute();
    const questId = uid();
    await db
      .insertInto("quests",)
      .values({
        id: questId,
        world_id: worldId,
        creator_id: userId,
        name: "Slay Dragon",
        type: "destruction",
        target: 1,
      },)
      .execute();
    await db
      .insertInto("world_lore_entries",)
      .values({
        id: uid(),
        world_id: worldId,
        content: "The dragon sleeps.",
      },)
      .execute();
    await db
      .insertInto("world_states",)
      .values({
        id: uid(),
        world_id: worldId,
        snapshot: "{}",
      },)
      .execute();
    await db
      .insertInto("location_states",)
      .values({
        id: uid(),
        location_id: locId,
        world_id: worldId,
      },)
      .execute();

    const zip = new JSZip();
    const checksums: Record<string, string> = {};
    const counts: Record<string, number> = {};
    const items: ExportItem[] = [];

    await exportStoryToZip({
      database: db,
      userId,
      zip,
      checksums,
      format: "json",
      counts,
      onItem: (item,) => {
        items.push(item,);
      },
    },);

    expect(counts.story,).toBeGreaterThanOrEqual(1,);
    const raw = await zip.file(`story/${worldId}.json`,)?.async("text",);
    expect(raw,).toBeDefined();
    const bundle = JSON.parse(raw as string,) as {
      schema_version: string;
      world: { name: string };
      locations: { name: string }[];
      quests: unknown[];
      world_lore_entries: unknown[];
      world_states: unknown[];
      location_states: unknown[];
    };
    expect(bundle.schema_version,).toBe("1.0",);
    expect(bundle.world.name,).toBe("Story World",);
    expect(bundle.locations[0]?.name,).toBe("Dungeon",);
    expect(bundle.quests,).toHaveLength(1,);
    expect(bundle.world_lore_entries,).toHaveLength(1,);
    expect(bundle.world_states,).toHaveLength(1,);
    expect(bundle.location_states,).toHaveLength(1,);
    expect(items.find((i,) => i.id === worldId),).toMatchObject({
      type: "story",
      name: "Story World",
      id: worldId,
    },);
  });
});
