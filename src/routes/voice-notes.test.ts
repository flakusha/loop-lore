import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { voiceNoteRoutes, } from "./voice-notes";

const BASE = "http://localhost";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Build the derived-context app (userId/userRole) around the route. */
function makeApp(db: Kysely<DB>, config: Config, userId: string | null,): Elysia {
  return new Elysia({ name: "test-voice-notes", },)
    .derive(() => ({ userId, userRole: "user", }))
    .use(voiceNoteRoutes({ database: db, config, },),) as unknown as Elysia;
}

/**
 * @param chatId
 * @param type
 * @param size
 */
function uploadRequest(chatId: string, type: string, size: number,): Request {
  const form = new FormData();
  const ext = type.split("/",)[1] ?? "bin";
  form.append("file", new File([new Uint8Array(size,),], `note.${ext}`, { type, },),);
  return new Request(`${BASE}/api/chats/${chatId}/voice-notes`, {
    method: "POST",
    body: form,
  },);
}

describe("voiceNoteRoutes", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let config: Config;
  let uploadDir: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    ownerId = uid();
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertActors(db, ownerId, {
      id: ownerId,
      actor_type: "user",
      user_id: ownerId,
      owner_id: ownerId,
      agent_type: "none",
      settings: "{}",
      row_version: 0,
    } as never,);

    await insertChats(db, "Voice Chat", ownerId, { id: "chat-1", } as never,);
    uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-voice-",),);
    config = createConfigSchema().defaults as Config;
    config.assets.uploadDir = uploadDir;
    config.assets.enabled = true;
  },);

  afterAll(async () => {
    rmSync(uploadDir, { recursive: true, force: true, },);
    await sqlite.close();
  },);

  test("returns 401 without userId", async () => {
    const app = makeApp(db, config, null,);
    const res = await app.handle(uploadRequest("chat-1", "audio/ogg", 10,),);
    expect(res.status,).toBe(401,);
  });

  test("returns 404 for a chat the caller cannot access", async () => {
    const app = makeApp(db, config, uid(),);
    const res = await app.handle(uploadRequest("chat-1", "audio/ogg", 10,),);
    expect(res.status,).toBe(404,);
  });

  test("rejects non-audio uploads with 422", async () => {
    const app = makeApp(db, config, ownerId,);
    const res = await app.handle(uploadRequest("chat-1", "image/png", 10,),);
    expect(res.status,).toBe(422,);
  });

  test("rejects oversize audio with 422", async () => {
    const app = makeApp(db, config, ownerId,);
    const res = await app.handle(uploadRequest("chat-1", "audio/ogg", 5 * 1024 * 1024 + 1,),);
    expect(res.status,).toBe(422,);
  });

  test("accepts an audio/ogg upload and stores an asset", async () => {
    const app = makeApp(db, config, ownerId,);
    const res = await app.handle(uploadRequest("chat-1", "audio/ogg", 64,),);
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { id: string; asset_type: string };
    expect(body.id,).toBeTruthy();
    expect(body.asset_type,).toBe("audio",);
  });
});
