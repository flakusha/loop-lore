// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for src/routes/nsfw/shared.ts#checkNsfwTargetAccess — the N2 authZ
 * guard that prevents cross-user NSFW state mutation via
 * `targetActorId`/`targetId`/`participants` body fields.
 *
 * Decision table under test (post-306176c06: chatId == null = world-scoped
 * mutation, allowed by design; chatId set = participant/owner required):
 * - empty targetActor        → allowed (nothing to check)
 * - caller owns the actor    → allowed
 * - admin role, any actor    → allowed (admin.character capability)
 * - non-owner, no chatId     → allowed (world-scoped mutation)
 * - non-owner, chat participant actor → allowed
 * - non-owner, actor absent from the chat → REJECTED
 * - nonexistent actor with chatId → REJECTED; without chatId → allowed
 *
 * RESOURCE CONTRACT — what each call owns:
 * - DISK: one in-memory SQLite via createTestDb() per FILE (beforeAll), like
 *   the sibling nsfw route suites; rows use test-scoped unique ids so tests
 *   stay order-independent within the file.
 * - No ports, no globals beyond the logger singleton (initialized in
 *   beforeAll per the scoped-isolate convention).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { checkNsfwTargetAccess, } from "./shared";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "fatal", },);
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

const OWNER_ID = "nsfw-shared-owner";
const OTHER_ID = "nsfw-shared-other";
const ADMIN_ID = "nsfw-shared-admin";
const OWNED_ACTOR = "nsfw-shared-actor-owned";
const FOREIGN_ACTOR = "nsfw-shared-actor-foreign";
const CHAT_ID = "nsfw-shared-chat";

beforeAll(async () => {
  await insertUsers(db, OWNER_ID, "Nsfw Shared Owner", {
    id: OWNER_ID as never,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2026-01-01T00:00:00Z",
  },);

  await insertUsers(db, OTHER_ID, "Nsfw Shared Other", {
    id: OTHER_ID as never,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2026-01-01T00:00:00Z",
  },);

  await insertUsers(db, ADMIN_ID, "Nsfw Shared Admin", {
    id: ADMIN_ID as never,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2026-01-01T00:00:00Z",
    role: "admin",
  },);

  await insertActors(db, "Owned Actor", {
    id: OWNED_ACTOR as never,
    owner_id: OWNER_ID,
    user_id: OWNER_ID,
    content_rating: "nsfw_moderate" as never,
  },);

  await insertActors(db, "Foreign Actor", {
    id: FOREIGN_ACTOR as never,
    owner_id: OTHER_ID,
    user_id: OTHER_ID,
    content_rating: "nsfw_moderate" as never,
  },);

  await insertChats(db, "Nsfw Shared Chat", OWNER_ID, { id: CHAT_ID, },);
  // FOREIGN_ACTOR participates in CHAT_ID — the participant escape hatch.
  await insertChatParticipants(db, CHAT_ID, FOREIGN_ACTOR, {},);
},);

describe("checkNsfwTargetAccess", () => {
  test("empty targetActor is allowed (no-op)", async () => {
    expect(await checkNsfwTargetAccess(db, "", OTHER_ID, null, null,),).toBe(true,);
  });

  test("caller-owned actor is allowed", async () => {
    expect(
      await checkNsfwTargetAccess(db, OWNED_ACTOR, OWNER_ID, "user", null,),
    ).toBe(true,);
  });

  test("admin role is allowed on any actor", async () => {
    expect(
      await checkNsfwTargetAccess(db, FOREIGN_ACTOR, ADMIN_ID, "admin", null,),
    ).toBe(true,);
  });

  // 306176c06: chatId == null means world-scoped mutation — allowed by design
  // (consent/ownership gates on the source actor already authorize it).
  test("non-owner without chatId is allowed (world-scoped mutation)", async () => {
    expect(
      await checkNsfwTargetAccess(db, FOREIGN_ACTOR, OWNER_ID, "user", null,),
    ).toBe(true,);
  });

  test("non-owner actor participating in the chat is allowed", async () => {
    expect(
      await checkNsfwTargetAccess(db, FOREIGN_ACTOR, OWNER_ID, "user", CHAT_ID,),
    ).toBe(true,);
  });

  test("non-owner actor absent from the chat is rejected", async () => {
    expect(
      await checkNsfwTargetAccess(db, FOREIGN_ACTOR, OWNER_ID, "user", "nsfw-shared-chat-missing",),
    ).toBe(false,);
  });

  test("nonexistent actor with chatId is rejected", async () => {
    expect(
      await checkNsfwTargetAccess(db, "nsfw-shared-actor-ghost", OWNER_ID, "user", CHAT_ID,),
    ).toBe(false,);
  });

  test("nonexistent actor without chatId is allowed (world-scoped mutation)", async () => {
    expect(
      await checkNsfwTargetAccess(db, "nsfw-shared-actor-ghost", OWNER_ID, "user", null,),
    ).toBe(true,);
  });
});
