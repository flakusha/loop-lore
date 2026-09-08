// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for actor-access helpers.
 *
 * Covers:
 * - resolveActorAccess: 200 (allow) / 403 (wrong user) / 404 (missing)
 * - resolvePrimaryActorId: returns the user-actor (owner_id IS NULL), not
 *   characters the user owns; null when no primary persona exists.
 */

import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { resolveActorAccess, resolvePrimaryActorId, } from "./actor-access";

describe("resolveActorAccess", () => {
  let db: Kysely<DB>;
  let userId: string;
  let actorId: string;
  let ownerCharId: string;
  let otherUserId: string;
  let otherActorId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    const testDb = await createTestDb();
    db = testDb.db;

    userId = uid();
    await insertUsers(db, "aa-user", "AA User", { id: userId, } as never,);

    actorId = uid();
    await insertActors(db, "AA User Persona", { id: actorId, user_id: userId, owner_id: null, } as never,);

    ownerCharId = uid();
    await insertActors(db, "AA Companion", { id: ownerCharId, user_id: null, owner_id: userId, } as never,);

    otherUserId = uid();
    await insertUsers(db, "aa-other", "AA Other", { id: otherUserId, } as never,);
    otherActorId = uid();
    await insertActors(db, "AA Other Persona", { id: otherActorId, user_id: otherUserId, owner_id: null, } as never,);
  },);

  test("returns null when user owns the user-actor", async () => {
    const res = await resolveActorAccess(db, actorId, userId,);
    expect(res,).toBeNull();
  });

  test("returns null when user owns the actor via owner_id", async () => {
    const res = await resolveActorAccess(db, ownerCharId, userId,);
    expect(res,).toBeNull();
  });

  test("returns 403 when actor belongs to another user", async () => {
    const res = await resolveActorAccess(db, otherActorId, userId,);
    expect(res,).not.toBeNull();
    expect(res!.status,).toBe(403,);
  });

  test("returns 404 when actor does not exist", async () => {
    const res = await resolveActorAccess(db, "nonexistent-actor", userId,);
    expect(res,).not.toBeNull();
    expect(res!.status,).toBe(404,);
  });
});

describe("resolvePrimaryActorId", () => {
  let db: Kysely<DB>;
  let userId: string;
  let actorId: string;
  let ownerCharId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    const testDb = await createTestDb();
    db = testDb.db;

    userId = uid();
    await insertUsers(db, "rp-user", "RP User", { id: userId, } as never,);

    // Primary persona: user_id set, owner_id null.
    actorId = uid();
    await insertActors(db, "RP User Persona", { id: actorId, user_id: userId, owner_id: null, } as never,);

    // Companion character owned by the user (should NOT be returned as primary).
    ownerCharId = uid();
    await insertActors(db, "RP Companion", { id: ownerCharId, user_id: null, owner_id: userId, } as never,);
  },);

  test("returns the user-actor where owner_id IS NULL", async () => {
    const res = await resolvePrimaryActorId(db, userId,);
    expect(res,).toBe(actorId,);
  });

  test("does NOT return actor rows where owner_id is set (character companions)", async () => {
    const res = await resolvePrimaryActorId(db, userId,);
    expect(res,).not.toBe(ownerCharId,);
  });

  test("returns null when the user has no actor rows", async () => {
    const lonelyUserId = uid();
    await insertUsers(db, "rp-lonely", "RP Lonely", { id: lonelyUserId, } as never,);
    const res = await resolvePrimaryActorId(db, lonelyUserId,);
    expect(res,).toBeNull();
  });
});
