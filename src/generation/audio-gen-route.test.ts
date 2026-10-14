/**
 * Tests for POST /api/v1/generation/audio/ambient guard branches.
 *
 * Scope: auth, chat ownership (IDOR), and request validation. The success
 * path (provider dispatch + asset persistence) is exercised end to end by
 * the template-apply test, which routes through this handler.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { handleAmbientGeneration, } from "./audio-gen-route";

describe("handleAmbientGeneration", () => {
  let db: Kysely<DB>;
  let ownerId = "";
  let chatId = "";
  let strangerId = "";

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerId = uid();
    strangerId = uid();
    chatId = uid();

    await insertUsers(db, `${ownerId}-user`, "Owner", { id: ownerId, } as never,);
    await insertUsers(db, `${strangerId}-user`, "Stranger", { id: strangerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, actor_type: "user", user_id: ownerId, } as never,);
    await insertChats(db, "Ambient Chat", ownerId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: "owner", } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("401s an unauthenticated caller before touching the database", async () => {
    const res = await handleAmbientGeneration({ tags: ["rain",], }, db, undefined,);
    expect(res.status,).toBe(401,);
  });

  test("400s on empty, over-long, or non-string tags", async () => {
    for (const tags of [[], new Array(9,).fill("rain",), [42,],]) {
      const res = await handleAmbientGeneration({ tags, }, db, ownerId,);
      expect(res.status,).toBe(400,);
    }
  });

  test("400s on out-of-range duration and intensity", async () => {
    expect((await handleAmbientGeneration({ tags: ["rain",], duration_sec: 0, }, db, ownerId,)).status,).toBe(400,);
    expect((await handleAmbientGeneration({ tags: ["rain",], duration_sec: 9_999, }, db, ownerId,)).status,).toBe(400,);
    expect((await handleAmbientGeneration({ tags: ["rain",], intensity: 1.5, }, db, ownerId,)).status,).toBe(400,);
    expect((await handleAmbientGeneration({ tags: ["rain",], intensity: -1, }, db, ownerId,)).status,).toBe(400,);
  });

  test("403s when the caller has no access to the linked chat", async () => {
    const res = await handleAmbientGeneration({ tags: ["rain",], chatId, }, db, strangerId,);
    expect(res.status,).toBe(403,);
  });

  test("400s for an unknown provider id after passing validation", async () => {
    const res = await handleAmbientGeneration({ tags: ["rain",], provider: "nope", }, db, ownerId,);
    expect(res.status,).toBe(400,);
  });
});
