// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for src/routes/nsfw/intimacy.ts — covers GET
 * /api/nsfw/intimacy/:actorId/:targetId and POST /api/nsfw/intimacy/action.
 *
 * Edge classes: unauthenticated (401), non-owner (403), NSFW disabled (403),
 * default pair creation, action application, and consent-gated actions.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema/config";
import { NsfwSection, } from "../../config/sections";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { resetNsfwRuntimeConfig, } from "../../nsfw/runtime-config";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertNsfwConsentState,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { intimacyRoutes, } from "./intimacy";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "warn", },);
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(() => {
  // Intimacy service mutators assert against the runtime-config singleton;
  // reset it so a sibling suite's allowNsfw=false cannot leak into these tests.
  resetNsfwRuntimeConfig();
},);

/**
 * Build an NSFW config fixture (only the nsfw section is read by the gate).
 * @param overrides
 */
function makeConfig(overrides: Partial<Config["nsfw"]> = {},): Config {
  return {
    nsfw: new NsfwSection(overrides,),
  } as unknown as Config;
}

/** Insert a canonical authorised user + owned actor (unique per call). */
async function seedAuthorized(id: string,): Promise<{ userId: string; actorId: string }> {
  const userId = `intimacy-test-user-${id}`;
  const actorId = `intimacy-test-actor-${id}`;
  await insertUsers(db, userId, `Intimacy Test User ${id}`, {
    id: userId as never,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2026-01-01T00:00:00Z",
  },);
  await insertActors(db, actorId, {
    id: actorId as never,
    owner_id: userId,
    user_id: userId,
    content_rating: "nsfw_moderate" as never,
  },);
  return { userId, actorId, };
}

/** Insert a target actor owned by a different user (unique per call). */
async function seedTarget(id: string,): Promise<string> {
  const ownerId = `intimacy-target-owner-${id}`;
  const targetId = `intimacy-test-target-${id}`;
  await insertUsers(db, ownerId, `Intimacy Target Owner ${id}`, {
    id: ownerId as never,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2026-01-01T00:00:00Z",
  },);
  await insertActors(db, targetId, {
    id: targetId as never,
    owner_id: ownerId,
    user_id: ownerId,
    content_rating: "nsfw_moderate" as never,
  },);
  return targetId;
}

/**
 * @param userId optional authenticated user
 * @param config
 */
function makeApp(userId?: string, config: Config = makeConfig(),) {
  const app = new Elysia({ name: "test-intimacy", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }
  return app.use(intimacyRoutes({ database: db, config, },),);
}

describe("intimacy routes — GET /api/nsfw/intimacy/:actorId/:targetId", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/intimacy/intimacy-test-actor-x/intimacy-test-target-x",),
    );
    expect(res.status,).toBe(401,);
  });

  test("owner → 200 with default pair", async () => {
    const { userId, actorId, } = await seedAuthorized("get",);
    const targetId = await seedTarget("get",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/intimacy/${actorId}/${targetId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.actorId,).toBe(actorId,);
    expect(body.targetActorId,).toBe(targetId,);
    expect(body.score,).toBe(0,);
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("getnonowner",);
    const targetId = await seedTarget("getnonowner",);
    await insertUsers(db, "intimacy-other", "Other", {
      id: "intimacy-other" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    const res = await makeApp("intimacy-other",).handle(
      new Request(`http://localhost/api/nsfw/intimacy/${actorId}/${targetId}`,),
    );
    expect(res.status,).toBe(403,);
  });

  test("NSFW disabled → 403", async () => {
    const { userId, actorId, } = await seedAuthorized("getdisabled",);
    const targetId = await seedTarget("getdisabled",);
    const res = await makeApp(userId, makeConfig({ allowNsfw: false, },),).handle(
      new Request(`http://localhost/api/nsfw/intimacy/${actorId}/${targetId}`,),
    );
    expect(res.status,).toBe(403,);
  });
});

describe("intimacy routes — POST /api/nsfw/intimacy/action", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/intimacy/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          actorId: "intimacy-test-actor-x",
          targetActorId: "intimacy-test-target-x",
          actionId: "act-1",
          actionName: "Kiss",
          actionType: "affection",
          delta: 5,
        },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("owner applies action → 200", async () => {
    const { userId, actorId, } = await seedAuthorized("put",);
    const targetId = await seedTarget("put",);
    const res = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/intimacy/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          actorId,
          targetActorId: targetId,
          actionId: "act-kiss",
          actionName: "Kiss",
          actionType: "affection",
          delta: 5,
          minIntimacy: 0,
          requiresConsent: false,
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.applied,).toBe(true,);
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("putnonowner",);
    const targetId = await seedTarget("putnonowner",);
    await insertUsers(db, "intimacy-other-put", "Other", {
      id: "intimacy-other-put" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    const res = await makeApp("intimacy-other-put",).handle(
      new Request("http://localhost/api/nsfw/intimacy/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          actorId,
          targetActorId: targetId,
          actionId: "act-kiss",
          actionName: "Kiss",
          actionType: "affection",
          delta: 5,
        },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("consent-gated action without consent → 403", async () => {
    const { userId, actorId, } = await seedAuthorized("putnoconsent",);
    const targetId = await seedTarget("putnoconsent",);
    const chatId = `intimacy-chat-noconsent`;
    await insertChats(db, "Intimacy Chat", userId, {
      id: chatId as never,
    },);
    await insertChatParticipants(db, chatId, actorId,);
    await insertChatParticipants(db, chatId, targetId,);
    const res = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/intimacy/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          chatId,
          actorId,
          targetActorId: targetId,
          actionId: "act-touch",
          actionName: "Touch",
          actionType: "physical",
          delta: 10,
          minIntimacy: 0,
          requiresConsent: true,
        },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("consent-gated action with consent → 200", async () => {
    const { userId, actorId, } = await seedAuthorized("putconsent",);
    const targetId = await seedTarget("putconsent",);
    const chatId = `intimacy-chat-consent`;
    await insertChats(db, "Intimacy Chat", userId, {
      id: chatId as never,
    },);
    await insertChatParticipants(db, chatId, actorId,);
    await insertChatParticipants(db, chatId, targetId,);
    await insertNsfwConsentState(db, userId, chatId, "given", "2026-01-01T00:00:00Z",);
    const res = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/intimacy/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          chatId,
          actorId,
          targetActorId: targetId,
          actionId: "act-touch",
          actionName: "Touch",
          actionType: "physical",
          delta: 10,
          minIntimacy: 0,
          requiresConsent: true,
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.applied,).toBe(true,);
  });
});
