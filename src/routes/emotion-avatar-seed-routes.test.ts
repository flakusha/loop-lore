// SPDX-License-Identifier: Apache-2.0

/**
 * Seed-option wiring for every emotion-avatar generation endpoint.
 *
 * The EmotionAvatarService is mocked (it drives real image generation); these
 * tests pin that each endpoint forwards the caller's base seed to the service
 * unchanged, and that an omitted seed stays omitted so the service can draw
 * (or reuse) one. Requires `--isolate`.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, expect, mock, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, insertWardrobeItems, } from "../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";

import { characterEmotionAvatarsRoutes, } from "./character-emotion-avatars";
import { wardrobeAvatarRoutes, } from "./wardrobe-avatars";

/** Recorded startBatchGeneration invocation. */
interface StartCall {
  actorId: string;
  baseAvatarId: string;
  emotions?: string[];
  outfitId?: string;
  replace?: boolean;
  seed?: number;
  seedStrategy?: "reuse";
}

const startCalls: StartCall[] = [];

if (ISOLATED) {
  mock.module("../characters/services/emotion-avatar-service", () => {
    /** */
    class EmotionAvatarService {
      /** */
      listJobs() {
        return [];
      }
      /** */
      getJobStatus() {
        return undefined;
      }
      /** */
      cancelJob() {
        return false;
      }
      /**
       * @param opts
       */
      async startBatchGeneration(opts: StartCall,) {
        startCalls.push({ ...opts, },);
        return `job-${startCalls.length}`;
      }
      /**
       * @param emotion
       */
      getEmotionPromptModifier(emotion: string,) {
        return `[${emotion} mood]`;
      }
    }
    return { EmotionAvatarService, };
  },);
}

const ACTOR = "00000000-0000-4000-8000-000000000201";
const USER = "00000000-0000-4000-8000-000000000202";
const ITEM = "00000000-0000-4000-8000-000000000203";

/**
 * @param db
 * @returns an app exposing the emotion-avatar and wardrobe avatar routes
 */
function makeApp(db: Kysely<DB>,) {
  return new Elysia({ name: "test-emotion-avatar-seed-routes", },)
    .derive(() => ({ userId: USER, userRole: "user", t: (key: string,) => `t:${key}`, }))
    .use(characterEmotionAvatarsRoutes({ database: db, },),)
    .use(wardrobeAvatarRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param path
 * @param body
 * @returns a JSON POST Request for the generation routes
 */
function post(path: string, body: unknown,): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describeOrSkip("emotion-avatar seed option wiring", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "seed-owner", "Seed Owner", { id: USER as never, },);
    await insertActors(db, "Seed Actor", {
      id: ACTOR as never,
      owner_id: USER,
      user_id: USER,
    },);

    await insertWardrobeItems(db, "Seed Outfit", {
      id: ITEM,
      actor_id: ACTOR,
      descriptor: "plate armor",
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("the actor-level batch endpoint forwards the base seed", async () => {
    startCalls.length = 0;
    const res = await makeApp(db,).handle(
      post(`/api/actors/${ACTOR}/emotion-avatars`, {
        baseAvatarId: "av-1",
        emotions: ["happy",],
        seed: 4242,
      },),
    );

    expect(res.status,).toBe(201,);
    expect(startCalls,).toHaveLength(1,);
    expect(startCalls[0]?.seed,).toBe(4242,);
  });

  test("an omitted seed stays omitted so the service can draw or reuse one", async () => {
    startCalls.length = 0;
    const res = await makeApp(db,).handle(
      post(`/api/actors/${ACTOR}/emotion-avatars`, {
        baseAvatarId: "av-1",
        emotions: ["happy",],
      },),
    );

    expect(res.status,).toBe(201,);
    expect(startCalls[0]?.seed,).toBeUndefined();
  });

  test("the actor-level batch endpoint forwards the reuse strategy", async () => {
    startCalls.length = 0;
    const res = await makeApp(db,).handle(
      post(`/api/actors/${ACTOR}/emotion-avatars`, {
        baseAvatarId: "av-1",
        emotions: ["happy",],
        seedStrategy: "reuse",
      },),
    );

    expect(res.status,).toBe(201,);
    expect(startCalls[0]?.seedStrategy,).toBe("reuse",);
  });

  test("an unknown seed strategy is not forwarded", async () => {
    startCalls.length = 0;
    const res = await makeApp(db,).handle(
      post(`/api/actors/${ACTOR}/emotion-avatars`, {
        baseAvatarId: "av-1",
        emotions: ["happy",],
        seedStrategy: "whatever",
      },),
    );

    expect(res.status,).toBe(201,);
    expect(startCalls[0]?.seedStrategy,).toBeUndefined();
  });

  test("the wardrobe batch endpoint forwards the base seed", async () => {
    startCalls.length = 0;
    const res = await makeApp(db,).handle(
      post(`/api/actors/${ACTOR}/wardrobe/${ITEM}/emotion-avatars`, {
        base_avatar_id: "av-1",
        emotions: ["happy",],
        seed: 4242,
      },),
    );

    expect(res.status,).toBe(201,);
    expect(startCalls,).toHaveLength(1,);
    expect(startCalls[0],).toMatchObject({ seed: 4242, outfitId: ITEM, },);
  });

  test("the wardrobe single-slot endpoint forwards the base seed", async () => {
    startCalls.length = 0;
    const res = await makeApp(db,).handle(
      post(`/api/actors/${ACTOR}/wardrobe/${ITEM}/emotion-avatars/single`, {
        base_avatar_id: "av-1",
        emotion: "happy",
        seed: 4242,
      },),
    );

    expect(res.status,).toBe(201,);
    expect(startCalls,).toHaveLength(1,);
    expect(startCalls[0],).toMatchObject({
      seed: 4242,
      emotions: ["happy",],
      outfitId: ITEM,
    },);
  });
},);
