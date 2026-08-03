/**
 * Unit tests for gm-notes routes (whitenotes + shadow notes CRUD).
 *
 * Covers auth (401), access control (403), create/list/reveal/delete,
 * and validation (400).
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { ShadowNoteType, WhiteneoteType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { gmNotesRoutes, } from "./gm-notes";

const BASE = "http://localhost";

/** Full-schema test DB with a chat owned by owner-1. */
async function setup(): Promise<Kysely<DB>> {
  const { db, } = await createTestDb();
  await insertUsers(db, "owner", "Owner", { id: "owner-1", } as any,);
  await insertUsers(db, "other", "Other", { id: "other-1", } as any,);
  await insertWorlds(db, "owner-1", "Test World", { id: "world-1", } as any,);
  await insertChats(
    db,
    "GM Chat",
    "owner-1",
    { id: "11111111-1111-4111-8111-111111111111", world_id: "world-1", } as any,
  );
  return db;
}

/** Bare app (no auth context) or with derived userId/userRole. */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia();
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(gmNotesRoutes({ database: db, config: {} as any, },),);
}

function getJson<T,>(res: Response,): Promise<T> {
  return res.json() as Promise<T>;
}

describe("gmNotesRoutes", () => {
  test("requires auth for all endpoints", async () => {
    const db = await setup();
    const app = makeApp(db,);

    const paths = [
      ["GET", "/api/chats/11111111-1111-4111-8111-111111111111/whitenotes", undefined,],
      ["POST", "/api/chats/11111111-1111-4111-8111-111111111111/whitenotes", { type: "tone", content: "Eerie", },],
      ["GET", "/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes", undefined,],
      ["POST", "/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes", {
        type: "foreshadowing",
        content: "Secret",
      },],
      [
        "POST",
        "/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes/00000000-0000-4000-8000-000000000000/reveal",
        undefined,
      ],
      [
        "DELETE",
        "/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes/00000000-0000-4000-8000-000000000000",
        undefined,
      ],
    ] as const;

    for (const [method, path, body,] of paths) {
      const res = await app.handle(
        new Request(`${BASE}${path}`, {
          method,
          headers: body ? { "Content-Type": "application/json", } : undefined,
          body: body ? JSON.stringify(body,) : undefined,
        },),
      );
      expect(res.status, `expected 401 for ${method} ${path}`,).toBe(401,);
    }
  });

  test("non-member without admin role gets 403", async () => {
    const db = await setup();
    const app = makeApp(db, "other-1",);

    const res = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`, { method: "GET", },),
    );
    expect(res.status,).toBe(403,);
  });

  test("shadow note create → list → reveal → delete lifecycle", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);

    // Create
    const created = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "world_secret", content: "The king is a lich.", },),
      },),
    );
    expect(created.status,).toBe(201,);
    const { id, } = await getJson<{ id: string }>(created,);
    expect(id,).toBeTruthy();

    // List
    const listed = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes`, { method: "GET", },),
    );
    expect(listed.status,).toBe(200,);
    const list = await getJson<{ items: { id: string; revealed: number; content: string }[]; total: number }>(listed,);
    expect(list.total,).toBe(1,);
    expect(list.items[0]!.content,).toBe("The king is a lich.",);
    expect(list.items[0]!.revealed,).toBe(0,);

    // Reveal
    const revealed = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes/${id}/reveal`, {
        method: "POST",
      },),
    );
    expect(revealed.status,).toBe(204,);

    const after = await getJson<{ items: { revealed: number }[] }>(
      await app.handle(
        new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes`, { method: "GET", },),
      ),
    );
    expect(after.items[0]!.revealed,).toBe(1,);

    // Delete
    const del = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes/${id}`, { method: "DELETE", },),
    );
    expect(del.status,).toBe(204,);

    // Delete again → 404
    const delAgain = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes/${id}`, { method: "DELETE", },),
    );
    expect(delAgain.status,).toBe(404,);
  });

  test("whitenote create with priority + list ordering", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);

    for (
      const [priority, content,] of [
        [3, "Low priority.",],
        [8, "High priority.",],
      ] as const
    ) {
      const res = await app.handle(
        new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ type: "tone", content, priority, scope: "scene", },),
        },),
      );
      expect(res.status,).toBe(201,);
    }

    const listed = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`, { method: "GET", },),
    );
    const list = await getJson<{ items: { priority: number; content: string }[] }>(listed,);
    expect(list.items[0]!.content,).toBe("High priority.",);
    expect(list.items[1]!.content,).toBe("Low priority.",);
  });

  test("rejects invalid body (empty content, bad type) with 422", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);

    const empty = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "tone", content: "", },),
      },),
    );
    expect(empty.status,).toBe(422,);

    const badType = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "not-a-type", content: "x", },),
      },),
    );
    expect(badType.status,).toBe(422,);
  });

  test("404 for unknown chat and unknown note id", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);

    const unknownChat = await app.handle(
      new Request(`${BASE}/api/chats/00000000-0000-4000-8000-000000000000/whitenotes`, { method: "GET", },),
    );
    expect(unknownChat.status,).toBe(403,); // checkChatAccess maps missing chat → forbidden

    const missing = await app.handle(
      new Request(
        `${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes/00000000-0000-4000-8000-000000000000`,
        { method: "DELETE", },
      ),
    );
    expect(missing.status,).toBe(404,);
  });

  test("enum values accepted for both note types", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);

    for (const type of Object.values(ShadowNoteType,)) {
      const res = await app.handle(
        new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ type, content: `note ${type}`, },),
        },),
      );
      expect(res.status,).toBe(201,);
    }
    for (const type of Object.values(WhiteneoteType,)) {
      const res = await app.handle(
        new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ type, content: `note ${type}`, },),
        },),
      );
      expect(res.status,).toBe(201,);
    }
  });
});
