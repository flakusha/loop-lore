// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/shared.test.ts — the building blocks
// the per-domain facade ops share: the calling principal's identity, the
// per-actor ownership guard and the two typed rejections.
//
// Resource contract (parallel-safe): one :memory: SQLite per test via
// createTestDb, no ports, no env, no sleeps.

import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { principalKind, } from "../../../middleware/principal-kind";
import { createRequestContext, } from "../../../middleware/types";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../../test-utils/insert-helpers";
import type { FacadeContext, } from "../types";
import { facadeContextFromRequestContext, } from "../types";
import {
  badBodyResult,
  callerIdentity,
  callerOwnsActor,
  notFoundResult,
  READ_ONLY_ANNOTATIONS,
} from "./shared";

const USER = "facade-shared-user";
const OTHER = "facade-shared-other";

let testDb: TestDb;
let db: Kysely<DB>;
const config = {} as Config;

beforeAll(() => {
  createLogger({ level: "error", },);
},);

beforeEach(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  await insertUsers(db, USER, "Facade Shared User", { id: USER, },);
  await insertUsers(db, OTHER, "Facade Shared Other", { id: OTHER, },);
},);

afterEach(async () => {
  await destroyTestDb(testDb,);
},);

function ctxFor(userId: string | null,): FacadeContext {
  const rc = createRequestContext({
    userId,
    userRole: userId === null ? null : "user",
    sessionId: null,
    principalKind: principalKind("user",),
  },);

  return facadeContextFromRequestContext({ ...rc, requestId: "req-facade-shared", }, db, config,);
}

describe("facade op shared building blocks", () => {
  test("callerIdentity returns the server-resolved user id", () => {
    expect(callerIdentity(ctxFor(USER,),),).toEqual({ userId: USER, userRole: "user", },);
  });

  test("callerIdentity throws when the principal carries no user id", () => {
    expect(() => callerIdentity(ctxFor(null,),)).toThrow(TypeError,);
  });

  test("callerOwnsActor accepts the owner_id and the user_id link only", async () => {
    const owned = await insertActors(db, "Owned", { id: "facade-shared-owned", owner_id: USER, },);
    const linked = await insertActors(db, "Linked", { id: "facade-shared-linked", user_id: USER, },);
    const foreign = await insertActors(db, "Foreign", { id: "facade-shared-foreign", owner_id: OTHER, },);

    expect(await callerOwnsActor({ database: db, actorId: owned, userId: USER, },),).toBe(true,);
    expect(await callerOwnsActor({ database: db, actorId: linked, userId: USER, },),).toBe(true,);
    expect(await callerOwnsActor({ database: db, actorId: foreign, userId: USER, },),).toBe(false,);
    expect(await callerOwnsActor({ database: db, actorId: "facade-shared-ghost", userId: USER, },),).toBe(false,);
  });

  test("the shared rejections carry the facade's own error shapes", () => {
    expect(badBodyResult("assets.list",),).toEqual({
      ok: false,
      status: 400,
      json: { error: "bad_request", message: "body does not match the assets.list schema", },
    },);

    expect(notFoundResult("asset not found",),).toEqual({
      ok: false,
      status: 404,
      json: { error: "not_found", message: "asset not found", },
    },);
  });

  test("the shared annotations are honest - read-only, never idempotent", () => {
    // The rule: every op appends an audit row, so no op may claim idempotency.
    expect(READ_ONLY_ANNOTATIONS,).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },);

    expect(READ_ONLY_ANNOTATIONS.idempotentHint,).toBeUndefined();
  });
});
