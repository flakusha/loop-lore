import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createRequestContext, type RequestContext, } from "../middleware/types";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  handleConvertToCharacter,
  handleCreatePersona,
  handleDeletePersona,
  handleGetPersona,
  handleListPersonas,
  handleUpdatePersona,
} from "./handlers";
import { PersonasService, } from "./service";

const OWNER_ID = "handlers-owner-1";
const PEER_ID = "handlers-peer-1";

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
  description: string | null;
}

interface StoredPersona {
  temperature: number | null;
  max_tokens: number | null;
  model: string | null;
  description: string | null;
  title: string | null;
  name: string;
}

interface ActorBody {
  actorId: string;
}

let db: Kysely<DB>;
let service: PersonasService;

/**
 * Build a request context for the given user.
 * @param userId - Authenticated user id, or null for anonymous.
 */
function ctxFor(userId: string | null,): RequestContext {
  return createRequestContext({ userId, userRole: userId ? "user" : null, sessionId: null, },);
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  for (const id of [OWNER_ID, PEER_ID,]) {
    await db
      .insertInto("users",)
      .values({
        id,
        username: id,
        display_name: id,
        password_hash: "hash",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();
  }
  service = new PersonasService(db,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("handleListPersonas", () => {
  test("rejects anonymous callers with 401", async () => {
    const res = await handleListPersonas({ database: db, context: ctxFor(null,), },);
    expect(res.status,).toBe(401,);
  });

  test("returns an empty list for a user with no personas", async () => {
    const res = await handleListPersonas({ database: db, context: ctxFor("handlers-fresh-user",), },);
    expect(res.status,).toBe(200,);
    const body: PersonaName[] = await res.json();
    expect(body,).toEqual([],);
  });

  test("lists personas created by the caller", async () => {
    await service.create({ userId: OWNER_ID, name: "Listable One", },);
    await service.create({ userId: OWNER_ID, name: "Listable Two", },);
    const res = await handleListPersonas({ database: db, context: ctxFor(OWNER_ID,), },);
    expect(res.status,).toBe(200,);
    const body: PersonaName[] = await res.json();
    const names = body.map((p,) => p.name);
    expect(names,).toContain("Listable One",);
    expect(names,).toContain("Listable Two",);
  });

  test("does not leak another user's personas", async () => {
    const res = await handleListPersonas({ database: db, context: ctxFor(PEER_ID,), },);
    expect(res.status,).toBe(200,);
    const body: PersonaName[] = await res.json();
    expect(body.map((p,) => p.name),).not.toContain("Listable One",);
  });
});

describe("handleCreatePersona", () => {
  test("rejects anonymous callers with 401", async () => {
    const res = await handleCreatePersona({ database: db, body: { name: "Nope", }, context: ctxFor(null,), },);
    expect(res.status,).toBe(401,);
  });

  test("rejects a missing name with 400", async () => {
    const res = await handleCreatePersona({ database: db, body: {}, context: ctxFor(OWNER_ID,), },);
    expect(res.status,).toBe(400,);
    const body: ErrorBody = await res.json();
    expect(body.error,).toContain("name",);
  });

  test("rejects an empty name with 400", async () => {
    const res = await handleCreatePersona({
      database: db,
      body: { name: "", },
      context: ctxFor(OWNER_ID,),
    },);
    expect(res.status,).toBe(400,);
  });

  test("rejects a non-string name with 400", async () => {
    const res = await handleCreatePersona({
      database: db,
      body: { name: 42, },
      context: ctxFor(OWNER_ID,),
    },);
    expect(res.status,).toBe(400,);
  });

  test("creates a persona with only a name and persists it", async () => {
    const res = await handleCreatePersona({
      database: db,
      body: { name: "Minimal", },
      context: ctxFor(OWNER_ID,),
    },);
    expect(res.status,).toBe(201,);
    const body: IdBody = await res.json();
    expect(typeof body.id,).toBe("string",);
    const stored = await service.getById(body.id, OWNER_ID,);
    expect(stored?.name,).toBe("Minimal",);
  });

  test("creates a persona with all optional fields", async () => {
    const res = await handleCreatePersona({
      database: db,
      body: {
        name: "Full",
        description: "A full persona",
        title: "Captain",
        avatarAssetId: null,
        temperature: 0.7,
        maxTokens: 2000,
        model: "test-model",
      },
      context: ctxFor(OWNER_ID,),
    },);
    expect(res.status,).toBe(201,);
    const body: IdBody = await res.json();
    const stored: StoredPersona | undefined = await service.getById(body.id, OWNER_ID,);
    expect(stored?.description,).toBe("A full persona",);
    expect(stored?.title,).toBe("Captain",);
    expect(stored?.temperature ?? 0,).toBeCloseTo(0.7,);
    expect(stored?.max_tokens,).toBe(2000,);
    expect(stored?.model,).toBe("test-model",);
  });

  test("ignores non-numeric tuning fields and still creates", async () => {
    const res = await handleCreatePersona({
      database: db,
      body: { name: "Loose Types", temperature: "hot", maxTokens: "many", model: 7, },
      context: ctxFor(OWNER_ID,),
    },);
    expect(res.status,).toBe(201,);
    const body: IdBody = await res.json();
    const stored: StoredPersona | undefined = await service.getById(body.id, OWNER_ID,);
    expect(stored?.temperature,).toBeNull();
    expect(stored?.max_tokens,).toBeNull();
    expect(stored?.model,).toBeNull();
  });
});

describe("handleGetPersona", () => {
  test("rejects anonymous callers with 401", async () => {
    const res = await handleGetPersona({ database: db, personaId: "whatever", context: ctxFor(null,), },);
    expect(res.status,).toBe(401,);
  });

  test("returns 404 for an unknown id", async () => {
    const res = await handleGetPersona({ database: db, personaId: "ghost-id", context: ctxFor(OWNER_ID,), },);
    expect(res.status,).toBe(404,);
  });

  test("returns 404 for another user's persona", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Private", },);
    const res = await handleGetPersona({ database: db, personaId: id, context: ctxFor(PEER_ID,), },);
    expect(res.status,).toBe(404,);
  });

  test("returns the persona for its owner", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Fetchable", description: "hi", },);
    const res = await handleGetPersona({ database: db, personaId: id, context: ctxFor(OWNER_ID,), },);
    expect(res.status,).toBe(200,);
    const body: PersonaBody = await res.json();
    expect(body.id,).toBe(id,);
    expect(body.name,).toBe("Fetchable",);
    expect(body.description,).toBe("hi",);
  });
});

describe("handleUpdatePersona", () => {
  test("rejects anonymous callers with 401", async () => {
    const res = await handleUpdatePersona({
      database: db,
      personaId: "whatever",
      body: { name: "Nope", },
      context: ctxFor(null,),
    },);
    expect(res.status,).toBe(401,);
  });

  test("updates scalar fields and returns ok", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Before", },);
    const res = await handleUpdatePersona({
      database: db,
      personaId: id,
      body: { name: "After", description: "new desc", title: "new title", },
      context: ctxFor(OWNER_ID,),
    },);
    expect(res.status,).toBe(200,);
    const body: OkBody = await res.json();
    expect(body.ok,).toBe(true,);
    const stored = await service.getById(id, OWNER_ID,);
    expect(stored?.name,).toBe("After",);
    expect(stored?.description,).toBe("new desc",);
    expect(stored?.title,).toBe("new title",);
  });

  test("updates tuning fields when present in the body", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Tunable", },);
    const res = await handleUpdatePersona({
      database: db,
      personaId: id,
      body: { temperature: 0.3, maxTokens: 500, model: "tuned-model", },
      context: ctxFor(OWNER_ID,),
    },);
    expect(res.status,).toBe(200,);
    const stored: StoredPersona | undefined = await service.getById(id, OWNER_ID,);
    expect(stored?.temperature ?? 0,).toBeCloseTo(0.3,);
    expect(stored?.max_tokens,).toBe(500,);
    expect(stored?.model,).toBe("tuned-model",);
  });

  test("accepts an empty body without touching fields", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Untouched", },);
    const res = await handleUpdatePersona({ database: db, personaId: id, body: {}, context: ctxFor(OWNER_ID,), },);
    expect(res.status,).toBe(200,);
    expect((await service.getById(id, OWNER_ID,))?.name,).toBe("Untouched",);
  });

  test("maps not-found to 404 and other failures to generic 500", async () => {
    const failingDb = {
      updateTable: () => {
        throw new Error("boom",);
      },
    } as unknown as Kysely<DB>;
    const res = await handleUpdatePersona({
      database: failingDb,
      personaId: "any-id",
      body: { name: "x", },
      context: ctxFor(OWNER_ID,),
    },);
    expect(res.status,).toBe(500,);
    const body: ErrorBody = await res.json();
    expect(body.error,).toBe("Failed to update persona",);
  });

  test("returns 404 when updating another user's persona (cross-user guard)", async () => {
    // Regression for BUG-persona-update-on-cross-user-id: a peer PATCHing
    // someone else's persona previously got 200 { ok: true } because
    // service.update() silently no-op'd on WHERE user_id mismatch. The
    // contract must match getById / delete / convertToCharacter → 404.
    const ownerId = await service.create({ userId: OWNER_ID, name: "Mine", },);
    const beforeStored = await service.getById(ownerId, OWNER_ID,);
    expect(beforeStored?.name,).toBe("Mine",);

    const res = await handleUpdatePersona({
      database: db,
      personaId: ownerId,
      body: { name: "Hijacked", },
      context: ctxFor(PEER_ID,),
    },);
    expect(res.status,).toBe(404,);

    // Peer must not have mutated the persona.
    const afterStored = await service.getById(ownerId, OWNER_ID,);
    expect(afterStored?.name,).toBe("Mine",);
  });

  test("returns 404 for an unknown persona id", async () => {
    const res = await handleUpdatePersona({
      database: db,
      personaId: "ghost-id-update",
      body: { name: "anything", },
      context: ctxFor(OWNER_ID,),
    },);
    expect(res.status,).toBe(404,);
  });
});

describe("handleDeletePersona", () => {
  test("rejects anonymous callers with 401", async () => {
    const res = await handleDeletePersona({ database: db, personaId: "whatever", context: ctxFor(null,), },);
    expect(res.status,).toBe(401,);
  });

  test("deletes the persona and returns 204", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Doomed", },);
    const res = await handleDeletePersona({ database: db, personaId: id, context: ctxFor(OWNER_ID,), },);
    expect(res.status,).toBe(204,);
    expect(await service.getById(id, OWNER_ID,),).toBeUndefined();
  });

  test("is idempotent for an unknown id", async () => {
    const res = await handleDeletePersona({ database: db, personaId: "ghost-id", context: ctxFor(OWNER_ID,), },);
    expect(res.status,).toBe(204,);
  });

  test("never deletes another user's persona", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Not Yours", },);
    const res = await handleDeletePersona({ database: db, personaId: id, context: ctxFor(PEER_ID,), },);
    expect(res.status,).toBe(204,);
    expect((await service.getById(id, OWNER_ID,))?.name,).toBe("Not Yours",);
  });
});

describe("handleConvertToCharacter", () => {
  test("rejects anonymous callers with 401", async () => {
    const res = await handleConvertToCharacter({ database: db, personaId: "whatever", context: ctxFor(null,), },);
    expect(res.status,).toBe(401,);
  });

  test("returns 404 for an unknown id", async () => {
    const res = await handleConvertToCharacter({ database: db, personaId: "ghost-id", context: ctxFor(OWNER_ID,), },);
    expect(res.status,).toBe(404,);
    const body: ErrorBody = await res.json();
    expect(body.error,).toContain("Persona not found",);
  });

  test("returns 404 for another user's persona", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Private Convert", },);
    const res = await handleConvertToCharacter({ database: db, personaId: id, context: ctxFor(PEER_ID,), },);
    expect(res.status,).toBe(404,);
  });

  test("converts a persona into a character actor", async () => {
    const id = await service.create({ userId: OWNER_ID, name: "Convert Me", description: "to actor", },);
    const res = await handleConvertToCharacter({ database: db, personaId: id, context: ctxFor(OWNER_ID,), },);
    expect(res.status,).toBe(201,);
    const body: ActorBody = await res.json();
    expect(typeof body.actorId,).toBe("string",);
    const actor = await db
      .selectFrom("actors",)
      .select(["id", "display_name", "owner_id", "description",],)
      .where("id", "=", body.actorId,)
      .executeTakeFirst();
    expect(actor?.display_name,).toBe("Convert Me",);
    expect(actor?.owner_id,).toBe(OWNER_ID,);
    expect(actor?.description,).toBe("to actor",);
  });

  test("falls back to a generic message for non-Error failures", async () => {
    const failingDb = {
      selectFrom: () => {
        throw "boom-string";
      },
    } as unknown as Kysely<DB>;
    const res = await handleConvertToCharacter({
      database: failingDb,
      personaId: "any-id",
      context: ctxFor(OWNER_ID,),
    },);
    expect(res.status,).toBe(500,);
    const body: ErrorBody = await res.json();
    expect(body.error,).toBe("Conversion failed",);
  });

  test("does not leak internal error messages (500 generic)", async () => {
    const failingDb = {
      selectFrom: () => {
        throw new Error("secret internal detail",);
      },
    } as unknown as Kysely<DB>;
    const res = await handleConvertToCharacter({
      database: failingDb,
      personaId: "any-id",
      context: ctxFor(OWNER_ID,),
    },);
    expect(res.status,).toBe(500,);
    const body: ErrorBody = await res.json();
    expect(body.error,).toBe("Conversion failed",);
    expect(body.error,).not.toContain("secret",);
  });
});
