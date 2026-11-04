// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route-level tests for the NSFW consent grant/revoke route.
 *
 * Covers the contract points of `POST /api/v1/nsfw/consent`: `given` persists
 * a consent row, `revoked` closes the prior grant, a missing `action` is a
 * 422, a client-supplied `userId` is refused with 422 (the DTO is closed),
 * and a chat the caller does not participate in is refused with 403.
 *
 * The body vocabulary is the consent ledger's own `given` / `revoked`.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema/config";
import { NsfwSection, } from "../../config/sections";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { getLatestConsent, } from "../../middleware/nsfw-gate/consent-ledger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { consentRoutes, } from "./consent";
import { nsfwRoutes, } from "./index";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "warn", },);
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

/**
 * @param overrides
 */
function makeConfig(overrides: Partial<Config["nsfw"]> = {},): Config {
  return {
    nsfw: new NsfwSection(overrides,),
  } as unknown as Config;
}

/** Insert a user with their own actor (unique per call). */
async function seedUser(id: string,): Promise<{ userId: string; actorId: string }> {
  const userId = `consent-user-${id}`;
  const actorId = `consent-actor-${id}`;
  await insertUsers(db, userId, `Consent User ${id}`, {
    id: userId as never,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2026-01-01T00:00:00Z",
  },);

  await insertActors(db, actorId, {
    id: actorId as never,
    owner_id: userId,
    user_id: userId,
  },);

  return { userId, actorId, };
}

/**
 * @param userId optional authenticated user
 */
function makeApp(userId?: string,) {
  const app = new Elysia({ name: "test-nsfw-consent", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }

  return app.use(consentRoutes({ database: db, config: makeConfig(), }, "/api/v1",),);
}

/**
 * @param body
 * @param userId optional authenticated user
 */
function post(body: Record<string, unknown>, userId?: string,) {
  return makeApp(userId,).handle(
    new Request("http://localhost/api/v1/nsfw/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

describe("POST /api/v1/nsfw/consent", () => {
  test("unauthenticated → 401", async () => {
    const res = await post({ chatId: "consent-chat-anon", action: "given", },);

    expect(res.status,).toBe(401,);
  });

  test("given persists a `given` row for (user, chat)", async () => {
    const { userId, actorId, } = await seedUser("grant",);
    const chatId = "consent-chat-grant";
    await insertChats(db, "Consent Chat", userId, { id: chatId as never, },);
    await insertChatParticipants(db, chatId, actorId,);

    const res = await post({ chatId, action: "given", }, userId,);

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.action,).toBe("given",);
    expect(body.granted,).toBe(true,);

    const row = await getLatestConsent(db, chatId, userId,);
    expect(row?.action,).toBe("given",);
    expect(row?.revokedAt,).toBeNull();
  });

  test("revoked persists a `revoked` row and closes the prior grant", async () => {
    const { userId, actorId, } = await seedUser("revoke",);
    const chatId = "consent-chat-revoke";
    await insertChats(db, "Consent Chat", userId, { id: chatId as never, },);
    await insertChatParticipants(db, chatId, actorId,);

    const granted = await post({ chatId, action: "given", }, userId,);
    expect(granted.status,).toBe(200,);

    // The ledger orders by `created_at`; keep the two rows on distinct
    // timestamps so "latest row" is unambiguous.
    await Bun.sleep(5,);

    const res = await post({ chatId, action: "revoked", }, userId,);

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.action,).toBe("revoked",);
    expect(body.granted,).toBe(false,);

    const row = await getLatestConsent(db, chatId, userId,);
    expect(row?.action,).toBe("revoked",);
  });

  test("missing `action` → 422", async () => {
    const { userId, actorId, } = await seedUser("noaction",);
    const chatId = "consent-chat-noaction";
    await insertChats(db, "Consent Chat", userId, { id: chatId as never, },);
    await insertChatParticipants(db, chatId, actorId,);

    const res = await post({ chatId, }, userId,);

    expect(res.status,).toBe(422,);
    expect(await getLatestConsent(db, chatId, userId,),).toBeNull();
  });

  test("chat creator without a participant row can grant → 200", async () => {
    const { userId, } = await seedUser("creator",);
    const chatId = "consent-chat-creator";
    await insertChats(db, "Creator Chat", userId, { id: chatId as never, },);

    const res = await post({ chatId, action: "given", }, userId,);

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.granted,).toBe(true,);
  });

  test("client-supplied `userId` → 422 (the DTO is closed)", async () => {
    const { userId, actorId, } = await seedUser("forged",);
    const chatId = "consent-chat-forged";
    await insertChats(db, "Consent Chat", userId, { id: chatId as never, },);
    await insertChatParticipants(db, chatId, actorId,);

    const res = await post({ chatId, action: "given", userId: "someone-else", }, userId,);

    expect(res.status,).toBe(422,);
    expect(await getLatestConsent(db, chatId, userId,),).toBeNull();
  });

  test("chat the caller does not participate in → 403", async () => {
    const { userId, } = await seedUser("outsider",);
    const { actorId: otherActorId, } = await seedUser("insider",);
    const chatId = "consent-chat-foreign";
    await insertChats(db, "Consent Chat", "consent-user-insider", { id: chatId as never, },);
    await insertChatParticipants(db, chatId, otherActorId,);

    const res = await post({ chatId, action: "given", }, userId,);

    expect(res.status,).toBe(403,);
    expect(await getLatestConsent(db, chatId, userId,),).toBeNull();
  });
});

/**
 * The grant route is only useful if the ledger it writes is what the write
 * routes read: these cases go through the full NSFW barrel.
 */
describe("consent route → gated writes", () => {
  /**
   * @param userId optional authenticated user
   */
  function makeBarrel(userId?: string,) {
    const app = new Elysia({ name: "test-nsfw-consent-barrel", },);
    if (userId) {
      app.derive(() => ({ userId, userRole: "user", }));
    }

    return app.use(nsfwRoutes({ database: db, config: makeConfig(), }, "/api/v1",),);
  }

  /**
   * @param userId
   * @param actorId
   * @param targetActorId
   * @param chatId
   */
  async function postAction(userId: string, actorId: string, targetActorId: string, chatId: string,) {
    return makeBarrel(userId,).handle(
      new Request("http://localhost/api/v1/nsfw/intimacy/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          chatId,
          actorId,
          targetActorId,
          actionId: "act-1",
          actionName: "Kiss",
          actionType: "physical",
          delta: 5,
          minIntimacy: 0,
          requiresConsent: true,
        },),
      },),
    );
  }

  /**
   * @param userId
   * @param actorId
   * @param chatId
   */
  async function postEncounter(userId: string, actorId: string, chatId: string,) {
    return makeBarrel(userId,).handle(
      new Request("http://localhost/api/v1/nsfw/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          chatId,
          actorId,
          participants: [actorId,],
          encounterType: "romantic",
        },),
      },),
    );
  }

  test("granting consent unblocks the intimacy action", async () => {
    const { userId, actorId, } = await seedUser("gate-grant",);
    const targetActorId = actorId;
    const chatId = "consent-chat-gate-grant";
    await insertChats(db, "Consent Chat", userId, { id: chatId as never, },);
    await insertChatParticipants(db, chatId, actorId,);

    const denied = await postAction(userId, actorId, targetActorId, chatId,);
    expect(denied.status,).toBe(403,);
    expect((await denied.json() as Record<string, unknown>).error,).toContain("consent_required",);

    const granted = await makeBarrel(userId,).handle(
      new Request("http://localhost/api/v1/nsfw/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ chatId, action: "given", },),
      },),
    );

    expect(granted.status,).toBe(200,);

    const allowed = await postAction(userId, actorId, targetActorId, chatId,);
    expect(allowed.status,).toBe(200,);
  });

  test("revoking consent re-blocks the intimacy action with consent_revoked", async () => {
    const { userId, actorId, } = await seedUser("gate-revoke",);
    const chatId = "consent-chat-gate-revoke";
    await insertChats(db, "Consent Chat", userId, { id: chatId as never, },);
    await insertChatParticipants(db, chatId, actorId,);

    const before = await postAction(userId, actorId, actorId, chatId,);
    expect(before.status,).toBe(403,);

    const app = makeBarrel(userId,);
    const grantedRes = await app.handle(
      new Request("http://localhost/api/v1/nsfw/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ chatId, action: "given", },),
      },),
    );

    expect(grantedRes.status,).toBe(200,);

    const allowed = await postAction(userId, actorId, actorId, chatId,);
    expect(allowed.status,).toBe(200,);

    await Bun.sleep(5,);
    const revokedRes = await app.handle(
      new Request("http://localhost/api/v1/nsfw/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ chatId, action: "revoked", },),
      },),
    );

    expect(revokedRes.status,).toBe(200,);

    const denied = await postAction(userId, actorId, actorId, chatId,);
    expect(denied.status,).toBe(403,);
    expect((await denied.json() as Record<string, unknown>).error,).toContain("consent_revoked",);
  });

  test("granting consent unblocks the encounter create; no grant stays denied", async () => {
    const { userId, actorId, } = await seedUser("gate-encounter",);
    const chatId = "consent-chat-gate-encounter";
    await insertChats(db, "Consent Chat", userId, { id: chatId as never, },);
    await insertChatParticipants(db, chatId, actorId,);

    const denied = await postEncounter(userId, actorId, chatId,);
    expect(denied.status,).toBe(403,);
    expect((await denied.json() as Record<string, unknown>).error,).toContain("consent_required",);

    const grantedRes = await makeBarrel(userId,).handle(
      new Request("http://localhost/api/v1/nsfw/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ chatId, action: "given", },),
      },),
    );

    expect(grantedRes.status,).toBe(200,);

    const allowed = await postEncounter(userId, actorId, chatId,);
    expect(allowed.status,).toBe(200,);
  });

  test("a chatless NSFW write → 422 (the consent stage is not skippable)", async () => {
    const { userId, actorId, } = await seedUser("chatless",);
    const res = await makeBarrel(userId,).handle(
      new Request("http://localhost/api/v1/nsfw/intimacy/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          actorId,
          targetActorId: actorId,
          actionId: "act-1",
          actionName: "Kiss",
          actionType: "physical",
          delta: 5,
        },),
      },),
    );

    expect(res.status,).toBe(422,);
  });
});
