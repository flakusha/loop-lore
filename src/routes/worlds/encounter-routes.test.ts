// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for src/routes/worlds/encounter-routes.ts — the generic
 * random-encounter endpoints (059), including the B1 combat-outcome →
 * battle conversion on the outcome POST.
 *
 * Edge classes: unauthenticated (401), unknown roll (400 via EncounterError),
 * unknown context template (404), triggered roll → outcome, and the opt-in
 * chatId conversion (started battle, clean refusal for non-combat templates).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterStats,
  insertChatParticipants,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { encounterRoutes, } from "./encounter-routes";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "warn", },);
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

/** Seed an owner user + a combat-enabled world they own. */
async function seedWorld(id: string,): Promise<{ userId: string; worldId: string }> {
  const userId = `enc-route-user-${id}`;
  await insertUsers(db, userId, `Enc Route User ${id}`, {
    id: userId as never,
  },);

  const worldId = `enc-route-world-${id}`;
  await insertWorlds(db, userId, `Enc Route World ${id}`, {
    id: worldId as never,
    rpg_enabled: 1,
    rpg_combat: 1,
  },);

  return { userId, worldId, };
}

/** Seed a chat with the caller (owner) plus one stat-carrying participant. */
async function seedChat(
  id: string,
  userId: string,
  worldId: string,
): Promise<{ chatId: string; foeId: string }> {
  const chatId = `enc-route-chat-${id}`;
  await insertChats(db, `Enc Route Chat ${id}`, userId, {
    id: chatId as never,
    world_id: worldId,
  },);

  await insertActors(db, `Caller ${id}`, { id: userId as never, user_id: userId, } as never,);
  await insertChatParticipants(db, chatId, userId, { role_in_chat: "owner", },);

  const foeId = `enc-route-foe-${id}`;
  await insertActors(db, `Foe ${id}`, { id: foeId as never, } as never,);
  await insertCharacterStats(db, foeId, 20, 20, 14,);
  await insertChatParticipants(db, chatId, foeId,);

  return { chatId, foeId, };
}

/** @param userId optional authenticated user */
function makeApp(userId?: string,) {
  const app = new Elysia({ name: "test-world-encounters", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }

  return app.use(encounterRoutes({ database: db, config: {} as never, },),);
}

/** @param res */
async function body(res: Response,): Promise<{ data?: Record<string, unknown> }> {
  return await res.json() as { data?: Record<string, unknown> };
}

describe("world encounter routes", () => {
  test("unauthenticated → 404 (world invisibility)", async () => {
    const { userId, worldId, } = await seedWorld("anon",);
    const res = await makeApp().handle(
      new Request(`http://localhost/api/worlds/${worldId}/encounter-templates`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("templates GET lists the world pool, POST adds a combat template", async () => {
    const { userId, worldId, } = await seedWorld("crud",);
    const app = makeApp(userId,);

    const empty = await body(
      await app.handle(
        new Request(`http://localhost/api/worlds/${worldId}/encounter-templates`,),
      ),
    );

    expect(empty.data,).toEqual([],);

    const created = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/encounter-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          name: "Ambush pack",
          type: "combat",
          triggerType: "random",
          triggerChance: 1,
        },),
      },),
    );

    expect(created.status,).toBe(201,);

    const listed = await body(
      await app.handle(
        new Request(`http://localhost/api/worlds/${worldId}/encounter-templates`,),
      ),
    );

    expect(listed.data,).toHaveLength(1,);
    expect((listed.data?.[0] as { type: string }).type,).toBe("combat",);
  });

  test("roll fires the lone combat template and records a roll id", async () => {
    const { userId, worldId, } = await seedWorld("roll",);
    const app = makeApp(userId,);
    await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/encounter-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          name: "Patrol",
          type: "combat",
          triggerType: "random",
          triggerChance: 1,
        },),
      },),
    );

    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/encounters/roll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ triggerType: "random", rngSeed: 1101, },),
      },),
    );

    expect(res.status,).toBe(200,);
    const data = await body(res,);
    expect(data.data?.triggered,).toBe(true,);
    expect(typeof data.data?.rollId,).toBe("string",);
  });

  test("outcome records without chatId and maps unknown rolls to 400", async () => {
    const { userId, worldId, } = await seedWorld("outcome",);
    const app = makeApp(userId,);
    await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/encounter-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          name: "Signs",
          type: "event",
          triggerType: "random",
          triggerChance: 1,
        },),
      },),
    );

    const roll = await body(
      await app.handle(
        new Request(`http://localhost/api/worlds/${worldId}/encounters/roll`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ triggerType: "random", rngSeed: 2202, },),
        },),
      ),
    );

    const rollId = roll.data?.rollId as string;

    const plain = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/encounters/${rollId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ outcome: { result: "signs-noted", }, },),
      },),
    );

    expect(plain.status,).toBe(200,);
    const plainData = await body(plain,);
    expect("converted" in (plainData.data ?? {}),).toBe(false,);

    const missing = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/encounters/no-such-roll/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ outcome: {}, },),
      },),
    );

    expect(missing.status,).toBe(400,);
  });

  test("outcome chatId converts a combat roll into a battle", async () => {
    const { userId, worldId, } = await seedWorld("convert",);
    const { chatId, } = await seedChat("convert", userId, worldId,);
    const app = makeApp(userId,);
    await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/encounter-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          name: "Ambush",
          type: "combat",
          triggerType: "random",
          triggerChance: 1,
        },),
      },),
    );

    const roll = await body(
      await app.handle(
        new Request(`http://localhost/api/worlds/${worldId}/encounters/roll`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ triggerType: "random", rngSeed: 3303, },),
        },),
      ),
    );

    const rollId = roll.data?.rollId as string;

    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/encounters/${rollId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          outcome: { result: "ambush", },
          chatId,
          createdBy: userId,
        },),
      },),
    );

    expect(res.status,).toBe(200,);
    const data = await body(res,);
    const converted = data.data?.converted as { battleId: string | null; reason?: string };
    expect(typeof converted.battleId,).toBe("string",);
    expect(converted.reason,).toBeUndefined();
  });

  test("outcome chatId on a non-combat roll refuses cleanly", async () => {
    const { userId, worldId, } = await seedWorld("refuse",);
    const { chatId, } = await seedChat("refuse", userId, worldId,);
    const app = makeApp(userId,);
    await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/encounter-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          name: "Weather turn",
          type: "event",
          triggerType: "random",
          triggerChance: 1,
        },),
      },),
    );

    const roll = await body(
      await app.handle(
        new Request(`http://localhost/api/worlds/${worldId}/encounters/roll`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ triggerType: "random", rngSeed: 4404, },),
        },),
      ),
    );

    const rollId = roll.data?.rollId as string;

    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/encounters/${rollId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          outcome: { result: "narrated", },
          chatId,
        },),
      },),
    );

    expect(res.status,).toBe(200,);
    const data = await body(res,);
    const converted = data.data?.converted as { battleId: string | null; reason?: string };
    expect(converted.battleId,).toBeNull();
    expect(converted.reason,).toContain("not a combat encounter",);
  });

  test("context GET builds the GM context and 404s on foreign templates", async () => {
    const { userId, worldId, } = await seedWorld("context",);
    const app = makeApp(userId,);
    const created = await body(
      await app.handle(
        new Request(`http://localhost/api/worlds/${worldId}/encounter-templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({
            name: "Shrine",
            type: "event",
            storyNotes: "A moss-covered shrine.",
            triggerType: "random",
            triggerChance: 1,
          },),
        },),
      ),
    );

    const templateId = (created.data as { id: string }).id;

    const res = await app.handle(
      new Request(
        `http://localhost/api/worlds/${worldId}/encounters/context?templateId=${templateId}`,
      ),
    );

    expect(res.status,).toBe(200,);

    const foreign = await app.handle(
      new Request(
        `http://localhost/api/worlds/${worldId}/encounters/context?templateId=other-world-template`,
      ),
    );

    expect(foreign.status,).toBe(404,);
  });
});
