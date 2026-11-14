// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/characters.test.ts — the characters
// facade ops over a :memory: database.
//
// Covers the slice's acceptance surfaces end-to-end through runFacadeOp:
//  - a permitted principal kind succeeds and returns the expected shape;
//  - another user's character is neither listed nor fetchable (the
//    cross-actor proof);
//  - the card payload carries the public fields only — no system prompt, no
//    creator notes, no example messages, no extensions;
//  - a principal kind the domain does not admit is refused with the
//    facade's own 403 `forbidden` shape.
//
// Resource contract (parallel-safe): one :memory: SQLite per test via
// createTestDb, no ports, no env, no sleeps.

import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { principalKind, type PrincipalKindLiteral, } from "../../../middleware/principal-kind";
import { createRequestContext, } from "../../../middleware/types";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../../test-utils/insert-helpers";
import { createFacadeRegistry, type FacadeRegistry, runFacadeOp, } from "../registry";
import type { FacadeContext, } from "../types";
import { facadeContextFromRequestContext, } from "../types";
import {
  CharacterCardOutputSchema,
  CharactersGetBody,
  CharactersListBody,
  CharactersListOutputSchema,
  registerCharactersOps,
} from "./characters";

const USER = "facade-characters-user";
const OTHER = "facade-characters-other";
const OWN_ACTOR = "facade-characters-own";
const FOREIGN_ACTOR = "facade-characters-foreign";

let testDb: TestDb;
let db: Kysely<DB>;
const config = {} as Config;

beforeAll(() => {
  createLogger({ level: "error", },);
},);

beforeEach(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  await insertUsers(db, USER, "Facade Characters User", { id: USER, },);
  await insertUsers(db, OTHER, "Facade Characters Other", { id: OTHER, },);
},);

afterEach(async () => {
  await destroyTestDb(testDb,);
},);

function buildRegistry(): FacadeRegistry {
  const registry = createFacadeRegistry();
  registerCharactersOps(registry, { database: db, config, },);
  return registry;
}

function ctxFor(userId: string, kind: PrincipalKindLiteral = "user",): FacadeContext {
  const rc = createRequestContext({
    userId,
    userRole: "user",
    sessionId: null,
    principalKind: principalKind(kind,),
    credentialId: kind === "external-agent" ? "facade-characters-cred" : null,
    credentialName: kind === "external-agent" ? "facade-characters-token" : null,
    credentialScope: kind === "external-agent" ? "read" : null,
  },);

  return facadeContextFromRequestContext({ ...rc, requestId: "req-facade-characters", }, db, config,);
}

async function seedCharacters(): Promise<void> {
  await insertActors(db, "Alice", {
    id: OWN_ACTOR,
    actor_type: "character",
    owner_id: USER,
    user_id: USER,
    description: "A tavern keeper.",
    personality: "warm, wary of strangers",
    scenario: "The lantern-lit common room.",
    welcome_message: "Welcome, traveller.",
    system_prompt: "SECRET-SYSTEM-PROMPT",
    creator_notes: "SECRET-CREATOR-NOTES",
    mes_example: "SECRET-EXAMPLE-MESSAGE",
    settings: JSON.stringify({ tags: ["tavern", "keeper",], extensions: { secret: "SECRET-EXTENSION", }, },),
  },);

  await insertActors(db, "Mallory", {
    id: FOREIGN_ACTOR,
    actor_type: "character",
    owner_id: OTHER,
    user_id: OTHER,
    description: "Someone else's character.",
    system_prompt: "FOREIGN-SYSTEM-PROMPT",
  },);
}

describe("facade characters ops", () => {
  test("characters.list returns the caller's own characters, never another user's", async () => {
    await seedCharacters();

    const result = await runFacadeOp(buildRegistry(), ctxFor(USER,), "characters.list", {},);

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);

    const json = result.json as { data: { id: string; name: string }[]; total: number };
    const ids = json.data.map((row,) => row.id);
    expect(ids,).toContain(OWN_ACTOR,);
    expect(ids,).not.toContain(FOREIGN_ACTOR,);
    expect(json.total,).toBe(1,);
  });

  test("characters.get returns the public card fields only — never the card's secrets", async () => {
    await seedCharacters();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "characters.get",
      { actorId: OWN_ACTOR, },
    );

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);

    const json = result.json as Record<string, unknown>;
    expect(json.id,).toBe(OWN_ACTOR,);
    expect(json.name,).toBe("Alice",);
    expect(json.description,).toBe("A tavern keeper.",);
    expect(json.personality,).toBe("warm, wary of strangers",);
    expect(json.scenario,).toBe("The lantern-lit common room.",);
    expect(json.firstMes,).toBe("Welcome, traveller.",);
    expect(json.tags,).toEqual(["tavern", "keeper",],);
    expect(json.systemPrompt,).toBeUndefined();
    expect(json.creatorNotes,).toBeUndefined();

    const serialized = JSON.stringify(result.json,);
    expect(serialized,).not.toContain("SECRET-SYSTEM-PROMPT",);
    expect(serialized,).not.toContain("SECRET-CREATOR-NOTES",);
    expect(serialized,).not.toContain("SECRET-EXAMPLE-MESSAGE",);
    expect(serialized,).not.toContain("SECRET-EXTENSION",);
  });

  test("characters.get hides another user's character behind a 404", async () => {
    await seedCharacters();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "characters.get",
      { actorId: FOREIGN_ACTOR, },
    );

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(404,);
    expect((result.json as { error: string }).error,).toBe("not_found",);
    expect(JSON.stringify(result.json,),).not.toContain("FOREIGN-SYSTEM-PROMPT",);
  });

  test("the characters domain refuses a principal kind it does not admit", async () => {
    await seedCharacters();

    const result = await runFacadeOp(buildRegistry(), ctxFor(USER, "user-worktree",), "characters.list", {},);

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(403,);
    expect((result.json as { error: string }).error,).toBe("forbidden",);
  });

  test("the characters domain admits the external-agent principal kind with a read tier", async () => {
    await seedCharacters();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER, "external-agent",),
      "characters.get",
      { actorId: OWN_ACTOR, },
    );

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);
  });

  test("every characters call writes one audit row through the shared audit path", async () => {
    await seedCharacters();

    await runFacadeOp(buildRegistry(), ctxFor(USER,), "characters.list", {},);

    const rows = await db
      .selectFrom("log_entries",)
      .selectAll()
      .where("event_type", "=", "facade.op",)
      .execute();

    expect(rows.length,).toBe(1,);
    expect(rows[0]?.action,).toBe("characters.list",);
    expect(rows[0]?.user_id,).toBe(USER,);
  });

  test("the characters ops carry the schemas a manifest generator needs", () => {
    const registry = buildRegistry();

    const list = registry.resolve("characters.list",);
    expect(list?.bodySchema,).toBe(CharactersListBody,);
    expect(list?.outputSchema,).toBe(CharactersListOutputSchema,);

    const get = registry.resolve("characters.get",);
    expect(get?.bodySchema,).toBe(CharactersGetBody,);
    expect(get?.outputSchema,).toBe(CharacterCardOutputSchema,);
  });
});
