import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { personaRoutes, } from "./controller";
import { PersonasService, } from "./service";

const OWNER_ID = "controller-owner-1";

interface ErrorBody {
  error: string;
}

interface IdBody {
  id: string;
}

interface OkBody {
  ok: boolean;
}

interface PersonaName {
  name: string;
}

interface PersonaBody {
  id: string;
  name: string;
}

interface ActorBody {
  actorId: string;
}

let db: Kysely<DB>;
let service: PersonasService;

/**
 * Build an Elysia app serving persona routes as the given user.
 * @param userId - Authenticated user id, or null for anonymous.
 */
function makeApp(userId: string | null,) {
  return new Elysia()
    .derive(() => ({ userId, userRole: userId ? "user" : null, sessionId: null, }))
    .use(personaRoutes({ database: db, },),);
}

/**
 * Build an app authenticated as the test owner.
 */
function authedApp() {
  return makeApp(OWNER_ID,);
}

/**
 * Build an app with no authenticated user.
 */
function anonApp() {
  return makeApp(null,);
}

/**
 * Build a JSON request.
 * @param path - Request path.
 * @param method - HTTP method.
 * @param body - Optional JSON body.
 */
function jsonRequest(path: string, method: string, body?: unknown,) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", },
    body: body === undefined ? undefined : JSON.stringify(body,),
  },);
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  await db
    .insertInto("users",)
    .values({
      id: OWNER_ID,
      username: OWNER_ID,
      display_name: OWNER_ID,
      password_hash: "hash",
      role: "solo",
      status: "active",
      settings: "{}",
    },)
    .execute();
  service = new PersonasService(db,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("GET /api/personas", () => {
  test("lists the caller's personas", async () => {
    await service.create({ userId: OWNER_ID, name: "Route Listed", },);
    const res = await authedApp().handle(new Request("http://localhost/api/personas",),);
    expect(res.status,).toBe(200,);
    const body: PersonaName[] = await res.json();
    expect(body.map((p,) => p.name),).toContain("Route Listed",);
  });

  test("rejects anonymous callers with 401", async () => {
    const res = await anonApp().handle(new Request("http://localhost/api/personas",),);
    expect(res.status,).toBe(401,);
  });
});

describe("POST /api/personas", () => {
  test("creates a persona and returns its id", async () => {
    const res = await authedApp().handle(jsonRequest("/api/personas", "POST", { name: "Route Created", },),);
    expect(res.status,).toBe(201,);
    const body: IdBody = await res.json();
    expect(typeof body.id,).toBe("string",);
    expect((await service.getById(body.id, OWNER_ID,))?.name,).toBe("Route Created",);
  });

  test("rejects a missing name with 400", async () => {
    const res = await authedApp().handle(jsonRequest("/api/personas", "POST", {},),);
    expect(res.status,).toBe(400,);
  });

  test("rejects anonymous callers with 401", async () => {
    const res = await anonApp().handle(jsonRequest("/api/personas", "POST", { name: "Nope", },),);
    expect(res.status,).toBe(401,);
  });
});

describe("GET /api/personas/:id", () => {
  test("returns the persona for its owner", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Route Fetched", },);
    const res = await authedApp().handle(new Request(`http://localhost/api/personas/${id}`,),);
    expect(res.status,).toBe(200,);
    const body: PersonaBody = await res.json();
    expect(body.id,).toBe(id,);
    expect(body.name,).toBe("Route Fetched",);
  });

  test("returns 404 for an unknown id", async () => {
    const res = await authedApp().handle(new Request("http://localhost/api/personas/ghost-id",),);
    expect(res.status,).toBe(404,);
  });

  test("rejects anonymous callers with 401", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Route Private", },);
    const res = await anonApp().handle(new Request(`http://localhost/api/personas/${id}`,),);
    expect(res.status,).toBe(401,);
  });
});

describe("PATCH /api/personas/:id", () => {
  test("updates the persona and returns ok", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Route Before", },);
    const res = await authedApp().handle(jsonRequest(`/api/personas/${id}`, "PATCH", { name: "Route After", },),);
    expect(res.status,).toBe(200,);
    const body: OkBody = await res.json();
    expect(body.ok,).toBe(true,);
    expect((await service.getById(id, OWNER_ID,))?.name,).toBe("Route After",);
  });

  test("rejects anonymous callers with 401", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Route Locked", },);
    const res = await anonApp().handle(jsonRequest(`/api/personas/${id}`, "PATCH", { name: "Nope", },),);
    expect(res.status,).toBe(401,);
    expect((await service.getById(id, OWNER_ID,))?.name,).toBe("Route Locked",);
  });
});

describe("DELETE /api/personas/:id", () => {
  test("deletes the persona and returns 204", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Route Doomed", },);
    const res = await authedApp().handle(new Request(`http://localhost/api/personas/${id}`, { method: "DELETE", },),);
    expect(res.status,).toBe(204,);
    expect(await service.getById(id, OWNER_ID,),).toBeUndefined();
  });

  test("rejects anonymous callers with 401", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Route Kept", },);
    const res = await anonApp().handle(new Request(`http://localhost/api/personas/${id}`, { method: "DELETE", },),);
    expect(res.status,).toBe(401,);
    expect((await service.getById(id, OWNER_ID,))?.name,).toBe("Route Kept",);
  });
});

describe("POST /api/personas/:id/convert-to-character", () => {
  test("converts the persona and returns the actor id", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Route Convert", },);
    const res = await authedApp().handle(jsonRequest(`/api/personas/${id}/convert-to-character`, "POST", {},),);
    expect(res.status,).toBe(201,);
    const body: ActorBody = await res.json();
    expect(typeof body.actorId,).toBe("string",);
  });

  test("returns 404 for an unknown id", async () => {
    const res = await authedApp().handle(jsonRequest("/api/personas/ghost-id/convert-to-character", "POST", {},),);
    expect(res.status,).toBe(404,);
    const body: ErrorBody = await res.json();
    expect(body.error,).toContain("Persona not found",);
  });

  test("rejects anonymous callers with 401", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Route Convert Locked", },);
    const res = await anonApp().handle(jsonRequest(`/api/personas/${id}/convert-to-character`, "POST", {},),);
    expect(res.status,).toBe(401,);
  });
});
