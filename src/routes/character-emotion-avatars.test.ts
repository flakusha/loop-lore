/**
 * Tests for character-emotion-avatars routes.
 *
 * The EmotionAvatarService is mocked (it drives real image generation in
 * production), so job state is scripted per scenario. Requires `--isolate`.
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

import { emitJobProgress, } from "../characters/services/emotion-avatar-service/job-events";
import { characterEmotionAvatarsRoutes, } from "./character-emotion-avatars";

if (ISOLATED) {
  mock.module("../characters/services/emotion-avatar-service", () => {
    const jobs = new Map<string, unknown>();
    /** */
    class EmotionAvatarService {
      /**
       * @param actorId
       */
      listJobs(actorId: string,) {
        return Array.from(jobs.values(),).filter((j,) => (j as { actorId: string }).actorId === actorId);
      }
      /**
       * @param jobId
       */
      getJobStatus(jobId: string,) {
        return jobs.get(jobId,);
      }
      /**
       * @param jobId
       */
      cancelJob(jobId: string,) {
        if (!jobs.has(jobId,)) { return false; }
        const job = jobs.get(jobId,);
        jobs.set(jobId, { ...(job as object), status: "cancelled", },);
        return true;
      }
      /**
       * @param opts
       * @param opts.actorId
       */
      async startBatchGeneration(opts: { actorId: string; emotions?: string[] },) {
        const jobId = `job-${jobs.size + 1}`;
        jobs.set(jobId, {
          id: jobId,
          actorId: opts.actorId,
          status: "running",
          results: (opts.emotions ?? []).map((emotion,) => ({ emotion, status: "pending", })),
        },);

        return jobId;
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
  const app = new Elysia({ name: "test-emotion-avatars", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, t: (key: string,) => `t:${key}`, }));
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

describeOrSkip("character-emotion-avatars routes", () => {
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

  test("POST start batch rejects emotions beyond one per emotion type", async () => {
    const all = Object.values(EmotionType,);
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ baseAvatarId: "av-1", emotions: [...all, ...all,], },),
      },),
    );

    expect(res.status,).toBe(400,);
    expect((await res.json() as { error?: string }).error,).toContain(String(all.length,),);
  });

  test("POST start batch rejects duplicate emotions", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ baseAvatarId: "av-1", emotions: ["happy", "sad", "happy",], },),
      },),
    );

    expect(res.status,).toBe(400,);
    expect((await res.json() as { error?: string }).error,).toContain("duplicate",);
  });

  test("POST start batch still accepts the full unique emotion set", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ baseAvatarId: "av-1", emotions: Object.values(EmotionType,), },),
      },),
    );

    expect(res.status,).toBe(201,);
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

  test("GET job returns 404 for a job owned by another actor", async () => {
    const createRes = await makeApp(db, "other", "user",).handle(
      new Request(`http://localhost/api/actors/${OTHER}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ baseAvatarId: "av-1", emotions: ["happy",], },),
      },),
    );

    const { jobId, } = await createRes.json() as JobBody;
    expect(jobId,).toBeDefined();

    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/${jobId}`,),
    );

    expect(res.status,).toBe(404,);
    const text = await res.text();
    expect(text,).toContain("characters.emotionJobNotFound",);
    expect(text,).not.toContain(OTHER,);
    expect(text,).not.toContain(jobId!,);

    // Not an enumeration oracle: identical body to an unknown job id.
    const unknownRes = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/no-such-job`,),
    );

    expect(unknownRes.status,).toBe(404,);
    expect(await unknownRes.text(),).toBe(text,);
  });

  test("POST cancel returns 404 for a job owned by another actor and leaves it running", async () => {
    const createRes = await makeApp(db, "other", "user",).handle(
      new Request(`http://localhost/api/actors/${OTHER}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ baseAvatarId: "av-1", emotions: ["happy",], },),
      },),
    );

    const { jobId, } = await createRes.json() as JobBody;
    expect(jobId,).toBeDefined();

    const cancelRes = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/${jobId}/cancel`, {
        method: "POST",
      },),
    );

    expect(cancelRes.status,).toBe(404,);
    const cancelText = await cancelRes.text();
    expect(cancelText,).toContain("characters.emotionJobNotFound",);

    // Not an enumeration oracle: identical body to an unknown job id.
    const unknownCancelRes = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/no-such-job/cancel`, {
        method: "POST",
      },),
    );

    expect(unknownCancelRes.status,).toBe(404,);
    expect(await unknownCancelRes.text(),).toBe(cancelText,);

    // The rejected cancel must NOT have destroyed the victim's job.
    const rereadRes = await makeApp(db, "other", "user",).handle(
      new Request(`http://localhost/api/actors/${OTHER}/emotion-avatars/jobs/${jobId}`,),
    );

    expect(rereadRes.status,).toBe(200,);
    expect((await rereadRes.json() as JobBody).status,).toBe("running",);
  });

  test("owner can still read and cancel their own job", async () => {
    const createRes = await makeApp(db, "other", "user",).handle(
      new Request(`http://localhost/api/actors/${OTHER}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ baseAvatarId: "av-1", emotions: ["happy",], },),
      },),
    );

    const { jobId, } = await createRes.json() as JobBody;

    const readRes = await makeApp(db, "other", "user",).handle(
      new Request(`http://localhost/api/actors/${OTHER}/emotion-avatars/jobs/${jobId}`,),
    );

    expect(readRes.status,).toBe(200,);
    expect((await readRes.json() as JobBody).status,).toBe("running",);

    const cancelRes = await makeApp(db, "other", "user",).handle(
      new Request(`http://localhost/api/actors/${OTHER}/emotion-avatars/jobs/${jobId}/cancel`, {
        method: "POST",
      },),
    );

    expect(cancelRes.status,).toBe(200,);
    expect((await cancelRes.json() as JobBody).cancelled,).toBe(true,);
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
},);

describeOrSkip("emotion-avatar job SSE stream", () => {
  let sseDb: Kysely<DB>;
  let sseSqlite: Database;

  beforeAll(async () => {
    ({ db: sseDb, sqlite: sseSqlite, } = await createTestDb());
    await insertUsers(sseDb, "owner", "Owner", { id: "owner" as never, },);
    await insertActors(sseDb, "Hero", { id: ACTOR as never, owner_id: "owner", },);
    // Same owner as ACTOR so "owner" can address ACTOR's job via the OTHER path;
    // the genuinely cross-tenant case is covered by the suite above.
    await insertActors(sseDb, "Second", { id: OTHER as never, owner_id: "owner", },);
  },);

  afterAll(() => sseSqlite.close());

  /**
   * @param response
   * @returns {Promise<string>}
   */
  async function readAll(response: Response,): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) { return ""; }
    const decoder = new TextDecoder();
    let out = "";
    for (;;) {
      const { done, value, } = await reader.read();
      if (done) { break; }
      out += decoder.decode(value, { stream: true, },);
    }

    out += decoder.decode();
    return out;
  }

  const sleep = (ms: number,) => new Promise((resolve,) => setTimeout(resolve, ms,));

  /**
   * Create a running two-emotion job for ACTOR.
   * @returns {Promise<string>}
   */
  async function createJob(): Promise<string> {
    const res = await makeApp(sseDb, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ baseAvatarId: "av-1", emotions: ["happy", "sad",], },),
      },),
    );

    const body = await res.json() as JobBody;
    if (!body.jobId) { throw new Error("expected jobId",); }
    return body.jobId;
  }

  test("requires auth", async () => {
    const res = await makeApp(sseDb,).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/job-1/stream`,),
    );

    expect(res.status,).toBe(401,);
  });

  test("returns 404 for an unknown job", async () => {
    const res = await makeApp(sseDb, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/unknown-job/stream`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("returns 404 for a job owned by another actor", async () => {
    const jobId = await createJob();
    const res = await makeApp(sseDb, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${OTHER}/emotion-avatars/jobs/${jobId}/stream`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("sends a terminal snapshot and done immediately for a finished job", async () => {
    const jobId = await createJob();
    await makeApp(sseDb, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/${jobId}/cancel`, {
        method: "POST",
      },),
    );

    const res = await makeApp(sseDb, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/${jobId}/stream`,),
    );

    expect(res.status,).toBe(200,);
    const body = await readAll(res,);
    expect(body,).toContain('"status":"cancelled"',);
    expect(body,).toContain("event: done",);
  });

  test("streams an initial snapshot, live events, and done on terminal", async () => {
    const jobId = await createJob();

    const res = await makeApp(sseDb, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotion-avatars/jobs/${jobId}/stream`,),
    );

    expect(res.status,).toBe(200,);
    expect(res.headers.get("Content-Type",),).toBe("text/event-stream",);
    expect(res.headers.get("Cache-Control",),).toBe("no-cache",);
    expect(res.headers.get("Connection",),).toBe("keep-alive",);
    expect(res.headers.get("X-Accel-Buffering",),).toBe("no",);

    const reader = res.body?.getReader();
    if (!reader) { throw new Error("expected a response body",); }
    const decoder = new TextDecoder();
    let body = "";
    while (!body.includes("event: progress",)) {
      const chunk = await reader.read();
      if (chunk.done) { break; }
      body += decoder.decode(chunk.value, { stream: true, },);
    }

    expect(body,).toContain(`"jobId":"${jobId}"`,);
    expect(body,).toContain('"done":0',);
    expect(body,).toContain('"total":2',);
    expect(body,).toContain('"status":"running"',);

    // Let the stream subscribe before driving the job to a terminal state
    // through the real in-process pub/sub.
    await sleep(50,);
    emitJobProgress({ jobId, done: 2, total: 2, status: "completed", },);

    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) { break; }
      body += decoder.decode(chunk.value, { stream: true, },);
    }

    expect(body,).toContain('"done":2',);
    expect(body,).toContain("event: done",);
  }, 20_000,);
},);

describeOrSkip("Emotion avatars — admin/solo bypass", () => {
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
},);
