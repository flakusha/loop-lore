/**
 * Tests for the actor-level emotion-avatar regeneration endpoint.
 *
 * The EmotionAvatarService is mocked (it drives real image generation in
 * production); `startBatchGeneration` records its invocation opts so the
 * tests can pin the delegation contract (slot replace vs append, emotion
 * subset/full-batch, base-avatar resolution). Requires `--isolate`.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, expect, mock, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { EmotionType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";

import { characterEmotionAvatarsRoutes, } from "./character-emotion-avatars";

/** Recorded startBatchGeneration invocation. */
interface StartCall {
  actorId: string;
  baseAvatarId: string;
  emotions?: string[];
  replace?: boolean;
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
       * @param opts.actorId
       * @param opts.baseAvatarId
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

const ACTOR = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-emotion-regenerate", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, t: (key: string,) => `t:${key}`, }));
  }

  return app.use(characterEmotionAvatarsRoutes({ database: db, },),) as unknown as Elysia;
}

describeOrSkip("emotion-avatars regenerate endpoint", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertUsers(db, "other", "Other", { id: "other" as never, },);
    await insertActors(db, "Hero", { id: ACTOR as never, owner_id: "owner", },);
    await insertActors(db, "Other Actor", { id: OTHER as never, owner_id: "other", },);
  },);

  afterAll(() => sqlite.close());

  /**
   * @param body
   * @param userId
   * @returns POST /regenerate response for the shared actor
   */
  function post(body: Record<string, unknown>, userId = "owner",): Promise<Response> {
    return makeApp(db, userId, "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/regenerate`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
  }

  test("requires auth", async () => {
    const res = await post({ replace: "slot", }, "",);
    expect(res.status,).toBe(401,);
  });

  test("returns 404 for another user's actor", async () => {
    const res = await post({ replace: "slot", }, "other",);
    expect(res.status,).toBe(404,);
  });

  test("rejects invalid replace mode", async () => {
    const res = await post({ replace: "overwrite", baseAvatarId: "av-1", },);
    expect(res.status,).toBe(422,);
  });

  test("rejects emotions beyond one per emotion type", async () => {
    const all = Object.values(EmotionType,);
    const res = await post({ replace: "append", baseAvatarId: "av-1", emotions: [...all, ...all,], },);
    expect(res.status,).toBe(400,);
    expect((await res.json() as { error?: string }).error,).toContain(String(all.length,),);
  });

  test("rejects duplicate emotions", async () => {
    const res = await post({ replace: "append", baseAvatarId: "av-1", emotions: ["happy", "happy",], },);
    expect(res.status,).toBe(400,);
    expect((await res.json() as { error?: string }).error,).toContain("duplicate",);
  });

  test("rejects invalid emotion", async () => {
    const res = await post({ replace: "slot", baseAvatarId: "av-1", emotions: ["not_a_real_emotion",], },);
    expect(res.status,).toBe(400,);
  });

  test("slot mode delegates with replace=true and the emotion subset", async () => {
    startCalls.length = 0;
    const res = await post({
      replace: "slot",
      baseAvatarId: "av-1",
      emotions: ["happy", "sad",],
    },);

    expect(res.status,).toBe(201,);
    const body = await res.json() as { jobId?: string };
    expect(body.jobId,).toBeDefined();
    expect(startCalls,).toHaveLength(1,);
    expect(startCalls[0],).toMatchObject({
      actorId: ACTOR,
      baseAvatarId: "av-1",
      emotions: ["happy", "sad",],
      replace: true,
    },);
  });

  test("append mode delegates without replace (bindings untouched)", async () => {
    startCalls.length = 0;
    const res = await post({
      replace: "append",
      baseAvatarId: "av-1",
      emotions: ["angry",],
    },);

    expect(res.status,).toBe(201,);
    expect(startCalls,).toHaveLength(1,);
    expect(startCalls[0]?.replace,).toBeUndefined();
  });

  test("omitted emotions delegate the full batch", async () => {
    startCalls.length = 0;
    const res = await post({ replace: "slot", baseAvatarId: "av-1", },);

    expect(res.status,).toBe(201,);
    expect(startCalls,).toHaveLength(1,);
    expect(startCalls[0]?.emotions,).toBeUndefined();
    expect(startCalls[0]?.replace,).toBe(true,);
  });

  test("rejects when no base avatar resolvable", async () => {
    startCalls.length = 0;
    const res = await post({ replace: "slot", },);
    expect(res.status,).toBe(400,);
    expect((await res.json() as { error?: string }).error,).toContain("baseAvatarId",);
    expect(startCalls,).toHaveLength(0,);
  });

  test("omitted baseAvatarId resolves the actor's primary avatar", async () => {
    await db.insertInto("assets",).values({
      id: "asset-regen-primary",
      owner_id: "owner",
      filename: "primary.png",
      mime_type: "image/png",
      asset_type: "image",
      size_bytes: 1024,
      storage_path: "/test/primary.png",
      storage_backend: "local",
      visibility: "private",
    },).execute();

    const { AvatarService, } = await import("../characters/services/avatar-service");
    const primaryId = await new AvatarService(db,).createAvatar({
      actorId: ACTOR,
      assetId: "asset-regen-primary",
      label: "primary portrait",
      isPrimary: true,
    },);

    startCalls.length = 0;
    const res = await post({ replace: "slot", emotions: ["happy",], },);

    expect(res.status,).toBe(201,);
    expect(startCalls,).toHaveLength(1,);
    expect(startCalls[0]?.baseAvatarId,).toBe(primaryId,);
  });

  test("accepts and ignores seedStrategy (separate open item)", async () => {
    startCalls.length = 0;
    const res = await post({
      replace: "slot",
      baseAvatarId: "av-1",
      emotions: ["happy",],
      seedStrategy: "fresh",
    },);

    expect(res.status,).toBe(201,);
    expect(startCalls,).toHaveLength(1,);
  });
},);
