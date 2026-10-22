import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { linkPreviewRoutes, } from "./link-previews";

const BASE = "http://localhost";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/**
 * Auth-context app via derive, mirroring message-polls.test.ts.
 * @param db
 * @param userId
 * @param userRole
 */
function previewApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-link-previews", },)
    .derive(() => ({ userId, userRole, }))
    .use(linkPreviewRoutes({ database: db, },),) as unknown as Elysia;
}

const OG_HTML = `<html><head><meta property="og:title" content="Route Page"></head></html>`;
let realFetch: typeof fetch;

/** */
function mockFetch(): void {
  globalThis.fetch = ((_input: string | URL | Request,): Promise<Response> => {
    return Promise.resolve(new Response(OG_HTML, { status: 200, },),);
  }) as unknown as typeof fetch;
}

describe("linkPreviewRoutes access checks", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    ownerId = uid();
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertChats(db, "Preview Chat", ownerId, { id: "chat-1", } as never,);
    chatId = "chat-1";
    realFetch = globalThis.fetch;
  },);

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await sqlite.close();
  },);

  test("returns 401 without userId", async () => {
    const app = previewApp(db, null, null,);
    const res = await app.handle(
      new Request(`${BASE}/api/chats/${chatId}/link-preview?url=https%3A%2F%2Fexample.com%2Fx`,),
    );

    expect(res.status,).toBe(401,);
  });

  test("refuses private-network URLs with 400", async () => {
    const app = previewApp(db, ownerId, null,);
    const res = await app.handle(
      new Request(`${BASE}/api/chats/${chatId}/link-preview?url=http%3A%2F%2F127.0.0.1%2Fsecret`,),
    );

    expect(res.status,).toBe(400,);
  });

  test("unfurls a public URL for a participant", async () => {
    mockFetch();
    const app = previewApp(db, ownerId, null,);
    const res = await app.handle(
      new Request(`${BASE}/api/chats/${chatId}/link-preview?url=https%3A%2F%2Fexample.com%2Fpage`,),
    );

    expect(res.status,).toBe(200,);
    const preview = (await res.json()) as { title: string | null };
    expect(preview.title,).toBe("Route Page",);
  });
});
