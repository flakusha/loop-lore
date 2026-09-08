// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW barrel tests — mounts nsfwRoutes behind the same derive-auth
 * harness as dice.test.ts and verifies the sub-plugin wiring.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema/config";
import { NsfwSection, } from "../../config/sections";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { LocationNsfwService, } from "../../rpg/location-nsfw/service";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertLocations,
  insertNsfwConsentState,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
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
  const userId = `nsfw-test-user-${id}`;
  const actorId = `nsfw-test-actor-${id}`;
  await insertUsers(db, userId, `NSFW Test User ${id}`, {
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

/**
 * @param userId optional authenticated user
 * @param config
 */
function makeApp(userId?: string, config: Config = makeConfig(),) {
  const app = new Elysia({ name: "test-nsfw-barrel", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }
  return app.use(nsfwRoutes({ database: db, config, },),);
}

describe("nsfwRoutes barrel", () => {
  test("assembles an Elysia instance", () => {
    expect(makeApp("u1",),).toBeInstanceOf(Elysia,);
  });

  test("registers the intimacy, seduction, body, encounter, fantasy, and location surfaces", () => {
    const paths = makeApp("u1",).routes.map((r,) => r.path);
    expect(paths.some((p,) => p.includes("/api/nsfw/intimacy",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/seduction",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/body",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/encounter",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/fantas",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/location",)),).toBe(true,);
  });

  test("intimacy lookup without auth returns 401 through the barrel", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/intimacy/actor-1/actor-2",),
    );
    expect(res.status,).toBe(401,);
  });
});

describe("N2 — /api/nsfw route access matrix", () => {
  test("unauthenticated NSFW route → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/desire/nsfw-test-actor",),
    );
    expect(res.status,).toBe(401,);
  });

  test("authenticated user with NSFW disabled → 403", async () => {
    await seedAuthorized("disabled",);
    const config = makeConfig({ allowNsfw: false, },);
    const res = await makeApp("nsfw-test-user-disabled", config,).handle(
      new Request("http://localhost/api/nsfw/desire/nsfw-test-actor-disabled",),
    );
    expect(res.status,).toBe(403,);
  });

  test("underage user → 403", async () => {
    await insertUsers(db, "nsfw-underage", "Underage", {
      id: "nsfw-underage" as never,
      birth_date: "2012-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    await insertActors(db, "nsfw-underage-actor", {
      id: "nsfw-underage-actor" as never,
      owner_id: "nsfw-underage",
      user_id: "nsfw-underage",
    },);
    const res = await makeApp("nsfw-underage",).handle(
      new Request("http://localhost/api/nsfw/desire/nsfw-underage-actor",),
    );
    expect(res.status,).toBe(403,);
  });

  test("actor-targeted route without consent → 403 (consentRequired on)", async () => {
    await seedAuthorized("noconsent",);
    const res = await makeApp("nsfw-test-user-noconsent",).handle(
      new Request("http://localhost/api/nsfw/intimacy/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          chatId: "nsfw-test-chat",
          actorId: "nsfw-test-actor-noconsent",
          targetActorId: "nsfw-test-target",
          actionId: "action-1",
          actionName: "kiss",
          actionType: "touch",
          delta: 5,
          minIntimacy: 0,
          requiresConsent: true,
          worldId: null,
        },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("consent granted → actor-targeted route proceeds (expects 200)", async () => {
    await seedAuthorized("granted",);
    const userId = "nsfw-test-user-granted";
    await insertActors(db, "nsfw-test-target-granted", {
      id: "nsfw-test-target-granted" as never,
      owner_id: userId,
      user_id: userId,
    },);
    await insertChats(db, "nsfw-chat-granted", userId, { id: "nsfw-chat-granted" as never, },);
    await insertChatParticipants(db, "nsfw-chat-granted", "nsfw-test-actor-granted",);
    await insertNsfwConsentState(
      db,
      userId,
      "nsfw-chat-granted",
      "given",
      "2026-01-01T00:00:00Z",
    );

    // Build an app with the consent-required config (default on).
    const res = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/desire/nsfw-test-actor-granted",),
    );
    // desire GET is not actor-pair-targeted, so it passes with just authZ.
    expect(res.status,).toBe(200,);

    // The actor-targeted intimacy action passes the consent gate.
    const actionRes = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/intimacy/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          chatId: "nsfw-chat-granted",
          actorId: "nsfw-test-actor-granted",
          targetActorId: "nsfw-test-target-granted",
          actionId: "action-1",
          actionName: "kiss",
          actionType: "touch",
          delta: 5,
          minIntimacy: 0,
          requiresConsent: true,
          worldId: null,
        },),
      },),
    );
    // applyAction runs against the (auto-created) pair → success.
    expect(actionRes.status,).toBe(200,);
  });

  test("encounter create with suitable location → 200", async () => {
    await seedAuthorized("encsuit",);
    const userId = "nsfw-test-user-encsuit";
    await insertWorlds(db, userId, "enc-world-suit", { id: "enc-world-suit" as never, },);
    await insertLocations(db, "enc-world-suit", "Private Den", {
      id: "enc-loc-suit" as never,
    },);
    await insertChats(db, "enc-chat-suit", userId, { id: "enc-chat-suit" as never, },);
    await insertChatParticipants(db, "enc-chat-suit", "nsfw-test-actor-encsuit",);
    await insertNsfwConsentState(db, userId, "enc-chat-suit", "given", "2026-01-01T00:00:00Z",);
    const res = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          chatId: "enc-chat-suit",
          actorId: "nsfw-test-actor-encsuit",
          worldId: "enc-world-suit",
          locationId: "enc-loc-suit",
          encounterType: "intimate",
          participants: ["nsfw-test-actor-encsuit",],
        },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("encounter create with unsuitable (public) location → 400", async () => {
    await seedAuthorized("encunsuit",);
    const userId = "nsfw-test-user-encunsuit";
    await insertWorlds(db, userId, "enc-world-unsuit", { id: "enc-world-unsuit" as never, },);
    await insertLocations(db, "enc-world-unsuit", "Town Square", {
      id: "enc-loc-unsuit" as never,
    },);
    // Default config is `private`; lower it to `public`.
    await new LocationNsfwService(db,).updateConfig("enc-loc-unsuit", { privacyLevel: "public", },);
    await insertChats(db, "enc-chat-unsuit", userId, { id: "enc-chat-unsuit" as never, },);
    await insertChatParticipants(db, "enc-chat-unsuit", "nsfw-test-actor-encunsuit",);
    await insertNsfwConsentState(db, userId, "enc-chat-unsuit", "given", "2026-01-01T00:00:00Z",);
    const res = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          chatId: "enc-chat-unsuit",
          actorId: "nsfw-test-actor-encunsuit",
          worldId: "enc-world-unsuit",
          locationId: "enc-loc-unsuit",
          encounterType: "intimate",
          participants: ["nsfw-test-actor-encunsuit",],
        },),
      },),
    );
    expect(res.status,).toBe(400,);
  });
});
