// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/memory.test.ts — the memory facade
// ops over a :memory: database.
//
// Covers the slice's acceptance surfaces end-to-end through runFacadeOp:
//  - a permitted principal kind succeeds and returns the expected shape;
//  - the repo's own privacy model decides visibility — a private memory is a
//    404, and a scope the facade cannot verify is never listed;
//  - another user's memory is unreachable (the cross-actor proof);
//  - the list carries metadata only, never the memory's text;
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
import {
  insertActorMemories,
  insertActors,
  insertChats,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { createFacadeRegistry, type FacadeRegistry, runFacadeOp, } from "../registry";
import type { FacadeContext, } from "../types";
import { facadeContextFromRequestContext, } from "../types";
import {
  MemoryDetailOutputSchema,
  MemoryGetBody,
  MemoryListBody,
  MemoryListOutputSchema,
  registerMemoryOps,
} from "./memory";

const USER = "facade-memory-user";
const OTHER = "facade-memory-other";
const OWN_ACTOR = "facade-memory-own";
const FOREIGN_ACTOR = "facade-memory-foreign";
const CHAT = "facade-memory-chat";

let testDb: TestDb;
let db: Kysely<DB>;
const config = {} as Config;

beforeAll(() => {
  createLogger({ level: "error", },);
},);

beforeEach(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  await insertUsers(db, USER, "Facade Memory User", { id: USER, },);
  await insertUsers(db, OTHER, "Facade Memory Other", { id: OTHER, },);
  await insertChats(db, "facade-memory-chat", USER, { id: CHAT, },);
},);

afterEach(async () => {
  await destroyTestDb(testDb,);
},);

function buildRegistry(): FacadeRegistry {
  const registry = createFacadeRegistry();
  registerMemoryOps(registry, { database: db, config, },);
  return registry;
}

function ctxFor(userId: string, kind: PrincipalKindLiteral = "user",): FacadeContext {
  const rc = createRequestContext({
    userId,
    userRole: "user",
    sessionId: null,
    principalKind: principalKind(kind,),
    credentialId: kind === "external-agent" ? "facade-memory-cred" : null,
    credentialName: kind === "external-agent" ? "facade-memory-token" : null,
    credentialScope: kind === "external-agent" ? "read" : null,
  },);

  return facadeContextFromRequestContext({ ...rc, requestId: "req-facade-memory", }, db, config,);
}

async function seedMemories(): Promise<{
  shared: string;
  private: string;
  worldScope: string;
  foreign: string;
}> {
  await insertActors(db, "Alice", { id: OWN_ACTOR, owner_id: USER, user_id: USER, },);
  await insertActors(db, "Mallory", { id: FOREIGN_ACTOR, owner_id: OTHER, user_id: OTHER, },);

  const shared = await insertActorMemories(db, OWN_ACTOR, "The lamplighter visits at dusk.", {
    source_chat_id: CHAT,
    scope: "character",
    privacy: "shared",
  },);

  const privateMemory = await insertActorMemories(db, OWN_ACTOR, "PRIVATE-MEMORY-TEXT", {
    source_chat_id: CHAT,
    scope: "character",
    privacy: "private",
  },);

  const worldScope = await insertActorMemories(db, OWN_ACTOR, "WORLD-SCOPE-TEXT", {
    source_chat_id: CHAT,
    scope: "world",
    privacy: "public",
  },);

  const foreign = await insertActorMemories(db, FOREIGN_ACTOR, "FOREIGN-MEMORY-TEXT", {
    source_chat_id: CHAT,
    scope: "character",
    privacy: "public",
  },);

  return { shared, private: privateMemory, worldScope, foreign, };
}

describe("facade memory ops", () => {
  test("memory.list returns the visible memories' metadata and nothing else", async () => {
    const memories = await seedMemories();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "memory.list",
      { actorId: OWN_ACTOR, chatId: CHAT, },
    );

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);

    const json = result.json as { data: Record<string, unknown>[]; total: number };
    const ids = json.data.map((row,) => row.id);
    expect(ids,).toContain(memories.shared,);
    expect(ids,).not.toContain(memories.private,);
    expect(ids,).not.toContain(memories.worldScope,);
    expect(json.total,).toBe(1,);

    // The summary carries metadata only — never the memory's text.
    expect(json.data[0]?.content,).toBeUndefined();
    expect(JSON.stringify(result.json,),).not.toContain("lamplighter",);
  });

  test("memory.get returns one visible memory's text", async () => {
    const memories = await seedMemories();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "memory.get",
      { memoryId: memories.shared, },
    );

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);

    const json = result.json as Record<string, unknown>;
    expect(json.id,).toBe(memories.shared,);
    expect(json.content,).toBe("The lamplighter visits at dusk.",);
    expect(json.scope,).toBe("character",);
    expect(json.privacy,).toBe("shared",);
  });

  test("memory.get hides a private memory behind a 404", async () => {
    const memories = await seedMemories();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "memory.get",
      { memoryId: memories.private, },
    );

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(404,);
    expect((result.json as { error: string }).error,).toBe("not_found",);
    expect(JSON.stringify(result.json,),).not.toContain("PRIVATE-MEMORY-TEXT",);
  });

  test("a malformed body is refused with the facade's own 400 shape", async () => {
    const registry = buildRegistry();

    const listed = await runFacadeOp(registry, ctxFor(USER,), "memory.list", { actorId: 5, },);
    expect(listed.ok,).toBe(false,);
    expect(listed.status,).toBe(400,);
    expect((listed.json as { error: string }).error,).toBe("bad_request",);

    const fetched = await runFacadeOp(registry, ctxFor(USER,), "memory.get", {},);
    expect(fetched.ok,).toBe(false,);
    expect(fetched.status,).toBe(400,);
    expect((fetched.json as { error: string }).error,).toBe("bad_request",);
  });

  test("memory.get hides another user's memory behind a 404", async () => {
    const memories = await seedMemories();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "memory.get",
      { memoryId: memories.foreign, },
    );

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(404,);
    expect((result.json as { error: string }).error,).toBe("not_found",);
    expect(JSON.stringify(result.json,),).not.toContain("FOREIGN-MEMORY-TEXT",);
  });

  test("memory.list refuses another user's character behind a 404", async () => {
    await seedMemories();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "memory.list",
      { actorId: FOREIGN_ACTOR, chatId: CHAT, },
    );

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(404,);
    expect((result.json as { error: string }).error,).toBe("not_found",);
  });

  test("the memory domain refuses a principal kind it does not admit", async () => {
    await seedMemories();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER, "user-worktree",),
      "memory.list",
      { actorId: OWN_ACTOR, chatId: CHAT, },
    );

    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(403,);
    expect((result.json as { error: string }).error,).toBe("forbidden",);
  });

  test("the memory domain admits the external-agent principal kind with a read tier", async () => {
    const memories = await seedMemories();

    const result = await runFacadeOp(
      buildRegistry(),
      ctxFor(USER, "external-agent",),
      "memory.get",
      { memoryId: memories.shared, },
    );

    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);
  });

  test("every memory call writes one audit row through the shared audit path", async () => {
    const memories = await seedMemories();

    await runFacadeOp(
      buildRegistry(),
      ctxFor(USER,),
      "memory.get",
      { memoryId: memories.shared, },
    );

    const rows = await db
      .selectFrom("log_entries",)
      .selectAll()
      .where("event_type", "=", "facade.op",)
      .execute();

    expect(rows.length,).toBe(1,);
    expect(rows[0]?.action,).toBe("memory.get",);
    expect(rows[0]?.user_id,).toBe(USER,);
  });

  test("the memory ops carry the schemas a manifest generator needs", () => {
    const registry = buildRegistry();

    const list = registry.resolve("memory.list",);
    expect(list?.bodySchema,).toBe(MemoryListBody,);
    expect(list?.outputSchema,).toBe(MemoryListOutputSchema,);

    const get = registry.resolve("memory.get",);
    expect(get?.bodySchema,).toBe(MemoryGetBody,);
    expect(get?.outputSchema,).toBe(MemoryDetailOutputSchema,);
  });
});
