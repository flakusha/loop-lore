/**
 * Tests for character systems import/export routes (TASK-014).
 *
 * Covers:
 * - GET  /api/actors/:actorId/systems/export  (JSON download)
 * - POST /api/actors/:actorId/systems/export  (filtered export)
 * - POST /api/actors/:actorId/systems/import  (import data)
 * - POST /api/actors/:actorId/systems/import/url (import from URL, SSRF-safe)
 *
 * Guards: 401 unauthenticated, 403 non-owner, 400 invalid payload / URL.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, mock, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { CharacterSystemsExport, } from "../characters/exporters/character-systems";
import { TraitsService, } from "../characters/services/traits-service";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertWorlds, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { characterIoRoutes, } from "./character-io";

function createIoApp(db: TestDb["db"], userId: string | null,): Elysia {
  return new Elysia({ name: "test-character-io", },)
    .derive(() => ({ userId, }))
    .use(characterIoRoutes({ database: db, },),) as unknown as Elysia;
}

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

async function seedUser(db: TestDb["db"], id: string,): Promise<void> {
  await db.insertInto("users",).values({
    id,
    username: `user-${id}`,
    display_name: "Test User",
    role: "user",
    status: "active",
    settings: "{}",
  },).execute();
}

async function seedActor(
  db: TestDb["db"],
  id: string,
  ownerId: string,
): Promise<void> {
  await db.insertInto("actors",).values({
    id,
    actor_type: "character",
    display_name: "Test Character",
    user_id: ownerId,
    owner_id: ownerId,
    agent_type: "npc",
    settings: "{}",
    visibility: "public",
    import_spec: "{}",
    content_rating: "sfw",
    template_overrides: "{}",
  },).execute();
}

/** Seed a permanent trait so export has a non-empty section to filter. */
async function seedTrait(db: TestDb["db"], actorId: string, name: string,): Promise<void> {
  await new TraitsService(db,).createPermanentTrait({
    actorId,
    category: "personality",
    name,
    value: "high",
  },);
}

// ── URL-import fetch stubbing (SSRF guard blocks real localhost) ──
const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string,) => Response | Promise<Response>,): void {
  const mocked = mock(async (url: string | URL | Request, _init?: RequestInit,) => {
    const urlStr = typeof url === "string" ? url : (url instanceof URL ? url.href : url.url);
    return handler(urlStr,);
  },);
  Object.defineProperty(globalThis, "fetch", { value: mocked, writable: true, configurable: true, },);
}

function restoreFetch(): void {
  Object.defineProperty(globalThis, "fetch", { value: originalFetch, writable: true, configurable: true, },);
}

describe("characterIoRoutes", () => {
  let db: TestDb["db"];
  let sqlite: Database;
  const ownerId = uid();
  const actorId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    const testDb = await createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
    await seedUser(db, ownerId,);
    await seedActor(db, actorId, ownerId,);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  describe("GET /systems/export", () => {
    test("returns 401 without authentication", async () => {
      const app = createIoApp(db, null,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/export`,),
      );
      expect(res.status,).toBe(401,);
    });

    test("returns 403 for a non-owner", async () => {
      const otherId = uid();
      await seedUser(db, otherId,);
      const app = createIoApp(db, otherId,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/export`,),
      );
      expect(res.status,).toBe(403,);
    });

    test("returns valid CharacterSystemsExport JSON for the owner", async () => {
      const app = createIoApp(db, ownerId,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/export`,),
      );
      expect(res.status,).toBe(200,);
      expect(res.headers.get("Content-Type",),).toContain("application/json",);

      const body = (await res.json()) as CharacterSystemsExport;
      expect(body.version,).toBe("1.0",);
      expect(body.characterId,).toBe(actorId,);
      expect(typeof body.exportedAt,).toBe("string",);
    });

    test("rejects an unsupported format query with 400", async () => {
      const app = createIoApp(db, ownerId,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/export?format=yaml`,),
      );
      expect(res.status,).toBe(400,);
    });
  });

  describe("POST /systems/export (filtered export)", () => {
    test("includeTraits=false excludes the traits section", async () => {
      await seedTrait(db, actorId, "brave",);
      const app = createIoApp(db, ownerId,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ includeTraits: false, }),
        },),
      );
      expect(res.status,).toBe(200,);
      const body = (await res.json()) as CharacterSystemsExport;
      expect(body.traits,).toBeUndefined();
    });

    test("default (no filters) includes the traits section", async () => {
      const app = createIoApp(db, ownerId,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({},),
        },),
      );
      expect(res.status,).toBe(200,);
      const body = (await res.json()) as CharacterSystemsExport;
      expect(body.traits,).toBeDefined();
      expect(body.traits?.permanent?.length,).toBeGreaterThan(0,);
    });

    test("returns 401 without authentication", async () => {
      const app = createIoApp(db, null,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({},),
        },),
      );
      expect(res.status,).toBe(401,);
    });
  });

  describe("POST /systems/import", () => {
    test("returns 400 when version is missing (invalid data)", async () => {
      const app = createIoApp(db, ownerId,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ characterId: actorId, }),
        },),
      );
      expect(res.status,).toBe(400,);
    });

    test("returns 401 without authentication", async () => {
      const app = createIoApp(db, null,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ version: "1.0", }),
        },),
      );
      expect(res.status,).toBe(401,);
    });

    test("imports traits, mood, and relationships and reports counts", async () => {
      const targetActorId = uid();
      await seedUser(db, targetActorId,);
      await seedActor(db, targetActorId, ownerId,);

      const payload: CharacterSystemsExport = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        characterId: actorId,
        traits: {
          permanent: [{ name: "loyal", value: "yes", category: "personality", },],
          world: [],
          location: [],
        },
        mood: {
          happiness: 80,
          baseMood: "cheerful",
          currentMood: "happy",
          moodStability: 0.5,
          expressionModifiers: {},
        },
        relationships: [{
          targetActorId,
          relationshipType: "friend",
          standing: 5,
          trust: 3,
          familiarity: 2,
          isBidirectional: true,
          metadata: {},
        },],
      };

      const app = createIoApp(db, ownerId,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify(payload,),
        },),
      );
      expect(res.status,).toBe(201,);
      const body = (await res.json()) as {
        success: boolean;
        imported: Record<string, number | boolean>;
        errors: string[];
      };
      expect(body.success,).toBe(true,);
      expect(body.imported.traits,).toBe(1,);
      expect(body.imported.mood,).toBe(true,);
      expect(body.imported.relationships,).toBe(1,);
      expect(body.errors,).toHaveLength(0,);
    });

    test("imports world-scoped traits only when a worldId is provided", async () => {
      const worldId = uid();
      const targetActorId = uid();
      await insertWorlds(db, ownerId, "Test World", { id: worldId, } as never,);
      await seedUser(db, targetActorId,);
      await seedActor(db, targetActorId, ownerId,);

      const payload = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        characterId: targetActorId,
        traits: {
          permanent: [],
          world: [{ name: "realm", value: "Ashen", category: "world", },],
          location: [],
        },
      };

      // Without a worldId, world traits are skipped (0 imported).
      const app = createIoApp(db, ownerId,);
      const noWorld = await app.handle(
        new Request(`http://localhost/api/actors/${targetActorId}/systems/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify(payload,),
        },),
      );
      expect(noWorld.status,).toBe(201,);
      const noWorldBody = (await noWorld.json()) as { imported: Record<string, number | boolean> };
      expect(noWorldBody.imported.traits,).toBe(0,);

      // With a worldId in the body, the world trait is imported.
      const withWorld = await app.handle(
        new Request(`http://localhost/api/actors/${targetActorId}/systems/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ ...payload, worldId, },),
        },),
      );
      expect(withWorld.status,).toBe(201,);
      const withWorldBody = (await withWorld.json()) as { imported: Record<string, number | boolean> };
      expect(withWorldBody.imported.traits,).toBe(1,);

      const worldTrait = await db
        .selectFrom("character_world_traits",)
        .where("actor_id", "=", targetActorId,)
        .where("world_id", "=", worldId,)
        .selectAll()
        .executeTakeFirst();
      expect(worldTrait?.trait_name,).toBe("realm",);
    });
  });

  describe("POST /systems/import/url", () => {
    test("returns 400 for a non-http(s) protocol (SSRF guard)", async () => {
      const app = createIoApp(db, ownerId,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/import/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ url: "ftp://example.com/data.json", }),
        },),
      );
      expect(res.status,).toBe(400,);
    });

    test("returns 400 for a loopback/private address (SSRF guard)", async () => {
      const app = createIoApp(db, ownerId,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/import/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ url: "http://169.254.169.254/meta", }),
        },),
      );
      expect(res.status,).toBe(400,);
    });

    test("returns 401 without authentication", async () => {
      const app = createIoApp(db, null,);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${actorId}/systems/import/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ url: "https://example.com/data.json", }),
        },),
      );
      expect(res.status,).toBe(401,);
    });

    test("imports data fetched from a valid URL", async () => {
      const payload: CharacterSystemsExport = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        characterId: actorId,
      };
      mockFetch((url,) => {
        expect(url,).toContain("data.example.com",);
        return Response.json(payload, { status: 200, },);
      },);

      try {
        const app = createIoApp(db, ownerId,);
        const res = await app.handle(
          new Request(`http://localhost/api/actors/${actorId}/systems/import/url`, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({ url: "https://data.example.com/char.json", }),
          },),
        );
        expect(res.status,).toBe(201,);
        const body = (await res.json()) as { success: boolean; errors: string[] };
        expect(body.success,).toBe(true,);
        expect(body.errors,).toHaveLength(0,);
      } finally {
        restoreFetch();
      }
    });

    test("returns 400 when the remote fetch fails", async () => {
      mockFetch(() => new Response("not found", { status: 404, },),);
      try {
        const app = createIoApp(db, ownerId,);
        const res = await app.handle(
          new Request(`http://localhost/api/actors/${actorId}/systems/import/url`, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({ url: "https://data.example.com/missing.json", }),
          },),
        );
        expect(res.status,).toBe(400,);
      } finally {
        restoreFetch();
      }
    });
  });
});
