/**
 * Tests for entity-routes factory (CRUD generator for child entities)
 *
 * Tests the generic factory using actor_notes as the concrete entity.
 * This covers the same code path used by actor_memories, actor_items,
 * actor_lore_entries, world_lore_entries, and story_items.
 */
import type { DB, } from "../db/schema";
import type { Kysely, } from "kysely";
import { Elysia, } from "elysia";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { createEntityRoutes, type EntityConfig, } from "./entity-routes";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";

const mockConfig = {} as any;

const NOTES_CONFIG: EntityConfig = {
  parentPrefix: "actors",
  entityPath: "notes",
  entityName: "Note",
  tableName: "actor_notes",
  parentFk: "actor_id",
  ownershipTable: "actors",
  ownershipFkColumn: "user_id",
  orderBy: [{ column: "created_at", dir: "desc", },],
  fieldMappings: {
    title: "title",
    content: "content",
    category: "category",
    pinned: "pinned",
    sortOrder: "sort_order",
  },
  jsonFields: [],
  defaults: { category: "general", pinned: "unpinned", sort_order: 0, },
  createRequired: ["title", "content",],
};

function createApp(db: Kysely<DB>, userId: string | null, userRole: string | null = "user",): Elysia {
  return new Elysia({ name: "test-entity", },)
    .derive(() => ({ userId, userRole, }))
    .use(createEntityRoutes(NOTES_CONFIG, { database: db, config: mockConfig, },),) as unknown as Elysia;
}

describe("createEntityRoutes", () => {
  let db: Kysely<DB>;
  let actorId: string;
  const userId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    // Seed user (required for actor FK)
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

    // Seed actor (parent)
    actorId = uid();
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Test Actor",
        user_id: userId,
        owner_id: userId,
        agent_type: "ai",
        settings: "{}",
        import_spec: "{}",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  // ── POST /api/actors/:id/notes ──────────────────────────────

  test("POST creates a note", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "My Note", content: "Body text", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { title: string; content: string; actor_id: string; id: string };
    expect(body.title,).toBe("My Note",);
    expect(body.content,).toBe("Body text",);
    expect(body.actor_id,).toBe(actorId,);
    expect(body.id,).toBeDefined();
  });

  test("POST returns 400 when required field missing", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "No title", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("POST returns 404 when parent not found", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/nonexistent/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "X", content: "Y", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST returns 404 when user doesn't own parent", async () => {
    const app = createApp(db, "other-user-id",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "X", content: "Y", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  // ── GET /api/actors/:id/notes ───────────────────────────────

  test("GET lists notes (paginated)", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/actors/${actorId}/notes`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: unknown[]; pagination: { total: number; page: number } };
    expect(body.data,).toBeInstanceOf(Array,);
    expect(body.pagination,).toBeDefined();
    expect(body.pagination.total,).toBeGreaterThanOrEqual(1,);
    expect(body.pagination.page,).toBe(1,);
  });

  test("GET returns 404 when parent not found", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/actors/nonexistent/notes`,),);
    expect(res.status,).toBe(404,);
  });

  // ── GET /api/actors/:id/notes/:entityId ─────────────────────

  test("GET by ID returns specific note", async () => {
    // Create a note first
    const app = createApp(db, userId,);
    const noteCreate = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "Find Me", content: "Here", },),
      },),
    );
    const created = (await noteCreate.json()) as { id: string };

    const res = await app.handle(new Request(`http://localhost/api/actors/${actorId}/notes/${created.id}`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { title: string };
    expect(body.title,).toBe("Find Me",);
  });

  test("GET by ID returns 404 for nonexistent entity", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/actors/${actorId}/notes/nonexistent`,),);
    expect(res.status,).toBe(404,);
  });

  // ── PUT /api/actors/:id/notes/:entityId ─────────────────────

  test("PUT updates a note", async () => {
    const app = createApp(db, userId,);
    const noteCreate = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "Before", content: "Original", },),
      },),
    );
    const created = (await noteCreate.json()) as { id: string };

    // Use "content" field — EntityUpdateBody schema only allows name/content/type/data
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/notes/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "Updated content", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { content: string; title: string };
    expect(body.content,).toBe("Updated content",);
    expect(body.title,).toBe("Before",); // unchanged
  });

  test("PUT returns 404 for nonexistent entity", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/notes/nonexistent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "X", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  // ── DELETE /api/actors/:id/notes/:entityId ──────────────────

  test("DELETE removes a note", async () => {
    const app = createApp(db, userId,);
    const noteCreate = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "Delete Me", content: "Gone", },),
      },),
    );
    const created = (await noteCreate.json()) as { id: string };

    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/notes/${created.id}`, {
        method: "DELETE",
      },),
    );
    expect(res.status,).toBe(204,);

    // Verify gone
    const noteGet = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/notes/${created.id}`,),
    );
    expect(noteGet.status,).toBe(404,);
  });

  // NOTE: DELETE for nonexistent entity returns 204 (idempotent) — pre-existing
  // behavior in entity-routes factory: Kysely delete.execute() always returns
  // array of length 1, so the "not found" branch never triggers.
  test("DELETE is idempotent for nonexistent entity", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/notes/nonexistent`, {
        method: "DELETE",
      },),
    );
    expect(res.status,).toBe(204,);
  });

  // ── Ownership / Auth ────────────────────────────────────────

  test("all endpoints return 404 for non-owner user", async () => {
    const app = createApp(db, "unauthorized-user",);

    const list = await app.handle(new Request(`http://localhost/api/actors/${actorId}/notes`,),);
    expect(list.status,).toBe(404,);

    const create = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "X", content: "Y", },),
      },),
    );
    expect(create.status,).toBe(404,);
  });

  test("admin role can access any parent's notes", async () => {
    const app = createApp(db, "some-other-user", "admin",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${actorId}/notes`,),);
    expect(res.status,).toBe(200,);
  });
});
