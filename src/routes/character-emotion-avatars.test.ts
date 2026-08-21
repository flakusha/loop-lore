/**
 * Tests for character-emotion-avatars routes.
 *
 * The EmotionAvatarService is mocked (it drives real image generation in
 * production), so job state is scripted per scenario. Requires `--isolate`.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, mock, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";

import { characterEmotionAvatarsRoutes, } from "./character-emotion-avatars";

mock.module("../characters/services/emotion-avatar-service", () => {
  const jobs = new Map<string, unknown>();
  class EmotionAvatarService {
    listJobs(actorId: string,) {
      return Array.from(jobs.values(),).filter((j,) => (j as { actorId: string }).actorId === actorId);
    }
    getJobStatus(jobId: string,) {
      return jobs.get(jobId,);
    }
    cancelJob(jobId: string,) {
      if (!jobs.has(jobId,)) { return false; }
      const job = jobs.get(jobId,);
      jobs.set(jobId, { ...(job as object), status: "cancelled", },);
      return true;
    }
    async startBatchGeneration(opts: { actorId: string },) {
      const jobId = `job-${jobs.size + 1}`;
      jobs.set(jobId, { jobId, actorId: opts.actorId, status: "running", },);
      return jobId;
    }
    getEmotionPromptModifier(emotion: string,) {
      return `[${emotion} mood]`;
    }
  }
  return { EmotionAvatarService, };
},);

const ACTOR = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-emotion-avatars", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(characterEmotionAvatarsRoutes({ database: db, },),) as unknown as Elysia;
}

interface JobBody {
  jobId?: string;
  status?: string;
  error?: string;
  ok?: boolean;
  cancelled?: boolean;
  emotion?: string;
  modifier?: string;
  value?: string;
  displayName?: string;
}

describe("character-emotion-avatars routes", () => {
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

  test("GET jobs requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs`,),
    );
    expect(res.status,).toBe(401,);
  });

  test("GET jobs returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "other", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET jobs lists jobs for actor", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as JobBody[];
    expect(Array.isArray(body,),).toBe(true,);
  });

  test("GET job status returns 404 for unknown job", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/unknown-job`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST start batch rejects missing baseAvatarId", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ emotions: ["happy",], },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("POST start batch rejects invalid emotion", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ baseAvatarId: "av-1", emotions: ["not_a_real_emotion",], },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("POST start batch creates a job", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ baseAvatarId: "av-1", emotions: ["happy", "sad",], },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = await res.json() as JobBody;
    expect(body.jobId,).toBeDefined();

    const statusRes = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/${body.jobId}`,),
    );
    expect(statusRes.status,).toBe(200,);
    expect((await statusRes.json() as JobBody).status,).toBe("running",);
  });

  test("POST start batch returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "other", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ baseAvatarId: "av-1", emotions: ["happy",], },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST cancel returns 404 for unknown job", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/unknown/cancel`, {
        method: "POST",
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST cancel cancels a running job", async () => {
    const createRes = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ baseAvatarId: "av-1", emotions: ["happy",], },),
      },),
    );
    const { jobId, } = await createRes.json() as JobBody;

    const cancelRes = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/${jobId}/cancel`, {
        method: "POST",
      },),
    );
    expect(cancelRes.status,).toBe(200,);
    const cancelBody = await cancelRes.json() as JobBody;
    expect(cancelBody.cancelled,).toBe(true,);
  });

  test("GET prompt-modifier returns modifier for valid emotion", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/api/emotions/prompt-modifier/happy",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as JobBody;
    expect(body.modifier,).toBe("[happy mood]",);
  });

  test("GET prompt-modifier rejects invalid emotion", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/api/emotions/prompt-modifier/notreal",),
    );
    expect(res.status,).toBe(400,);
  });

  test("GET prompt-modifier requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request("http://localhost/api/emotions/prompt-modifier/happy",),
    );
    expect(res.status,).toBe(401,);
  });

  test("GET types lists emotion types", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/api/emotions/types",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as JobBody[];
    expect(body.length,).toBeGreaterThanOrEqual(10,);
    expect(body[0]?.value,).toBeDefined();
    expect(body[0]?.displayName,).toBeDefined();
  });
});

describe("Emotion avatars — admin/solo bypass", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertActors(db, "Hero", { id: ACTOR as never, owner_id: "owner", },);
  },);

  afterAll(() => sqlite.close());

  test("admin can GET jobs for another user's actor", async () => {
    const app = makeApp(db, "admin", "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs`,),
    );
    expect(res.status,).toBe(200,);
  });

  test("solo can GET jobs for another user's actor", async () => {
    const app = makeApp(db, "solo", "solo",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs`,),
    );
    expect(res.status,).toBe(200,);
  });

  test("admin can POST batch for another user's actor", async () => {
    const app = makeApp(db, "admin", "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ baseAvatarId: "av-1", emotions: ["happy",], },),
      },),
    );
    expect(res.status,).toBe(201,);
  });
});
