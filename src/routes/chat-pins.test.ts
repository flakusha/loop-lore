/**
 * Tests for chat-pins routes (list / pin / unpin).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChatPins,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { chatPinRoutes, } from "./chat-pins";

function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-chat-pins", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(chatPinRoutes({ database: db, },),);
}

interface PinRow {
  id: string;
  message_id: string;
  pinned_by: string;
  content: string;
  display_name: string;
}

interface PinResponse {
  data?: PinRow[];
  ok?: boolean;
  already?: boolean;
  id?: string;
  error?: string;
}

describe("chat-pins routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertUsers(db, "member", "Member", { id: "member" as never, },);
    await insertUsers(db, "outsider", "Outsider", { id: "outsider" as never, },);
    await insertActors(db, "User Owner", { id: "owner" as never, actor_type: "user" as never, },);
    await insertActors(db, "User Member", { id: "member" as never, actor_type: "user" as never, },);
    await insertActors(db, "User Outsider", { id: "outsider" as never, actor_type: "user" as never, },);
    await insertChats(db, "Pinned Chat", "owner", { id: "chat-1" as never, },);
    await insertChatParticipants(db, "chat-1", "member",);
    await insertMessages(db, "chat-1", "member", "user", "hello", { id: "msg-1" as never, },);
    await insertMessages(db, "chat-1", "owner", "assistant", "hi there", { id: "msg-2" as never, },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  describe("GET /chats/:id/pins", () => {
    test("requires auth", async () => {
      const app = makeApp(db,);
      const res = await app.handle(new Request("http://localhost/api/chats/chat-1/pins",),);
      expect(res.status,).toBe(401,);
    });

    test("returns empty list when nothing pinned", async () => {
      const app = makeApp(db, "owner", "user",);
      const res = await app.handle(new Request("http://localhost/api/chats/chat-1/pins",),);
      const body = await res.json() as PinResponse;
      expect(body.data,).toEqual([],);
    });

    test("returns pins joined with message content and actor name", async () => {
      await insertChatPins(db, "chat-1", "msg-1", "member", { id: "pin-1" as never, },);
      const app = makeApp(db, "member", "user",);
      const res = await app.handle(new Request("http://localhost/api/chats/chat-1/pins",),);
      const body = await res.json() as PinResponse;
      expect(body.data,).toHaveLength(1,);
      expect(body.data![0]!.message_id,).toBe("msg-1",);
      expect(body.data![0]!.content,).toBe("hello",);
      expect(body.data![0]!.display_name,).toBe("User Member",);
      expect(body.data![0]!.pinned_by,).toBe("member",);
    });

    test("404 for non-participant outsider", async () => {
      const app = makeApp(db, "outsider", "user",);
      const res = await app.handle(new Request("http://localhost/api/chats/chat-1/pins",),);
      expect(res.status,).toBe(404,);
    });
  });

  describe("POST /chats/:id/pins", () => {
    test("pins a message", async () => {
      const app = makeApp(db, "member", "user",);
      const res = await app.handle(
        new Request("http://localhost/api/chats/chat-1/pins", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ messageId: "msg-2", },),
        },),
      );
      const body = await res.json() as PinResponse;
      expect(body.ok,).toBe(true,);
      expect(body.id,).toBeDefined();
      expect(body.already,).toBeUndefined();
    });

    test("returns already=true for duplicate pin", async () => {
      const app = makeApp(db, "member", "user",);
      const res = await app.handle(
        new Request("http://localhost/api/chats/chat-1/pins", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ messageId: "msg-1", },),
        },),
      );
      const body = await res.json() as PinResponse;
      expect(body.ok,).toBe(true,);
      expect(body.already,).toBe(true,);
    });

    test("requires auth", async () => {
      const app = makeApp(db,);
      const res = await app.handle(
        new Request("http://localhost/api/chats/chat-1/pins", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ messageId: "msg-1", },),
        },),
      );
      expect(res.status,).toBe(401,);
    });

    test("404 for outsider", async () => {
      const app = makeApp(db, "outsider", "user",);
      const res = await app.handle(
        new Request("http://localhost/api/chats/chat-1/pins", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ messageId: "msg-1", },),
        },),
      );
      expect(res.status,).toBe(404,);
    });
  });

  describe("DELETE /chats/:id/pins/:pinId", () => {
    test("pinner can unpin", async () => {
      const app = makeApp(db, "member", "user",);
      const res = await app.handle(
        new Request("http://localhost/api/chats/chat-1/pins/pin-1", { method: "DELETE", },),
      );
      const body = await res.json() as PinResponse;
      expect(body.ok,).toBe(true,);
    });

    test("403 for unrelated user", async () => {
      await insertChatPins(db, "chat-1", "msg-2", "owner", { id: "pin-2" as never, },);
      const app = makeApp(db, "member", "user",);
      const res = await app.handle(
        new Request("http://localhost/api/chats/chat-1/pins/pin-2", { method: "DELETE", },),
      );
      expect(res.status,).toBe(403,);
    });

    test("404 for missing pin", async () => {
      const app = makeApp(db, "member", "user",);
      const res = await app.handle(
        new Request("http://localhost/api/chats/chat-1/pins/pin-nope", { method: "DELETE", },),
      );
      expect(res.status,).toBe(404,);
    });
  });
});
