// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for the export-sse surface (start / status / download)
 * plus the job processor and SSE framing helpers in jobs.ts.
 *
 * The shared in-memory job registry is mutated directly to stage queued
 * and completed jobs; every staged entry is removed again so no global
 * state leaks between tests.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { downloadRoutes, } from "./download";
import { jobs, processExport, sseData, } from "./jobs";
import { startRoutes, } from "./start";
import { statusRoutes, } from "./status";
import type { ExportJob, } from "./types";

interface StatusBody {
  id: string;
  status: string;
  progress: number;
  total: number;
  percentage: number;
}

/**
 * Stage a job in the shared registry for status/download tests.
 * @param db owning database (unused, kept for call symmetry)
 * @param overrides fields to override on the staged job
 */
function stageJob(_db: Kysely<DB>, overrides: Partial<ExportJob> = {},): ExportJob {
  const id = uid();
  const job: ExportJob = {
    userId: "cov-user",
    status: "queued",
    progress: 0,
    total: 0,
    currentStep: "Queued...",
    createdAt: new Date(),
    ...overrides,
    id,
  };
  jobs.set(id, job,);
  return job;
}

describe("export-sse jobs helpers", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    for (const id of [...jobs.keys(),]) {
      if (id.startsWith("cov-",)) {
        jobs.delete(id,);
      }
    }
    await db.destroy();
  },);

  test("sseData frames payloads as SSE data lines", () => {
    const line = sseData({ type: "progress", progress: 1, },);
    expect(line.startsWith("data: "),).toBe(true,);
    expect(line.endsWith("\n\n"),).toBe(true,);
    expect(line,).toContain('"progress":1',);
  },);

  test("sseData falls back when the payload is unserializable", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const line = sseData(circular,);
    expect(line,).toContain('"type":"error"',);
  },);

  test("processExport completes an empty-database export", async () => {
    const job = stageJob(db,);
    const req = new Request("http://localhost/api/export/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ include: ["chats",], format: "json", },),
    },);
    await processExport(job.id, req, db, "cov-user",);
    const done = jobs.get(job.id,);
    expect(done?.status,).toBe("completed",);
    expect(done?.currentStep,).toBe("Export completed",);
    expect(done?.zipBuffer?.length ?? 0,).toBeGreaterThan(0,);
    jobs.delete(job.id,);
  },);

  test("processExport tolerates malformed request bodies", async () => {
    const job = stageJob(db,);
    const req = new Request("http://localhost/api/export/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: "{{{",
    },);
    await processExport(job.id, req, db, "cov-user",);
    expect(jobs.get(job.id,)?.status,).toBe("completed",);
    jobs.delete(job.id,);
  },);

  test("processExport counts and zips every section", async () => {
    const stamp = Date.now().toString(36,);
    await db.insertInto("users",).values({
      id: "cov-user",
      username: `cov-export-${stamp}`,
      display_name: "Cov Export",
      password_hash: "h",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    await db.insertInto("actors",).values({
      id: `cov-actor-${stamp}`,
      actor_type: "character",
      display_name: "Cov Character",
      user_id: "cov-user",
      owner_id: "cov-user",
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },).execute();
    await db.insertInto("chats",).values({
      id: `cov-chat-${stamp}`,
      name: "Cov Chat",
      created_by: "cov-user",
    },).execute();
    await db.insertInto("worlds",).values({
      id: `cov-world-${stamp}`,
      name: "Cov World",
      owner_id: "cov-user",
    },).execute();
    await db.insertInto("locations",).values({
      id: `cov-loc-${stamp}`,
      world_id: `cov-world-${stamp}`,
      name: "Cov Location",
    },).execute();
    const job = stageJob(db,);
    const req = new Request("http://localhost/api/export/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({
        include: ["characters", "chats", "worlds", "assets", "locations", "story",],
        format: "json",
      },),
    },);
    await processExport(job.id, req, db, "cov-user",);
    const done = jobs.get(job.id,);
    expect(done?.status,).toBe("completed",);
    // character + chat + world + location + story(world count): no assets seeded.
    expect(done?.total,).toBe(5,);
    expect(done?.progress,).toBe(5,);
    jobs.delete(job.id,);
  },);

  test("processExport ignores unknown job ids and marks DB failures", async () => {
    const req = new Request("http://localhost/api/export/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({},),
    },);
    await processExport("cov-missing", req, db, "cov-user",);
    const broken = (await createTestDb()).db;
    await broken.destroy();
    const job = stageJob(db,);
    await processExport(job.id, req, broken as Kysely<DB>, "cov-user",);
    const failed = jobs.get(job.id,);
    expect(failed?.status,).toBe("failed",);
    expect(failed?.error?.length ?? 0,).toBeGreaterThan(0,);
    jobs.delete(job.id,);
  },);
});

describe("export-sse routes", () => {
  let db: Kysely<DB>;
  let app: Elysia;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    app = new Elysia({ name: "test-export-sse-coverage", },)
      .derive({ as: "scoped", }, () => ({ userId: "cov-user", userRole: "user", }),)
      .use(startRoutes({ database: db, },),)
      .use(statusRoutes({ database: db, },),)
      .use(downloadRoutes({ database: db, },),) as unknown as Elysia;
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("start streams job_created through to a terminal event", async () => {
    // Reads to the natural end of the stream instead of cancelling: the
    // route's polling interval throws "Controller is already closed" when
    // it ticks after a client disconnect, so cancelling mid-stream would
    // leak an unhandled error into the module run.
    const res = await app.handle(new Request("http://localhost/api/export/progress", {
      method: "POST",
    },),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type"),).toContain("text/event-stream",);
    const reader = res.body?.getReader();
    expect(reader,).toBeDefined();
    const decoder = new TextDecoder();
    let buf = "";
    let done = false;
    for (let i = 0; i < 200 && !done; i += 1) {
      const chunk = await reader?.read();
      if (chunk?.value) {
        buf += decoder.decode(chunk.value,);
      }
      done = chunk?.done ?? true;
    }
    expect(buf,).toContain("job_created",);
    expect(buf,).toContain('"type":"completed"',);
    const match = /"jobId":"([^"]+)"/.exec(buf.replaceAll(" ", ""),);
    expect(match?.[1]?.length ?? 0,).toBeGreaterThan(0,);
    const jobId = match?.[1] as string;
    const status = (await (await app.handle(
      new Request(`http://localhost/api/export/status/${jobId}`,),
    )).json()) as StatusBody;
    expect(status.id,).toBe(jobId,);
    expect(status.status,).toBe("completed",);
    jobs.delete(jobId,);
  }, 30000,);

  test("status and download 404 unknown jobs", async () => {
    const status = await app.handle(
      new Request(`http://localhost/api/export/status/${uid()}`,),
    );
    expect(status.status,).toBe(404,);
    const download = await app.handle(
      new Request(`http://localhost/api/export/download/${uid()}`,),
    );
    expect(download.status,).toBe(404,);
  },);

  test("queued jobs report zero progress and are not downloadable", async () => {
    const job = stageJob(db,);
    const status = (await (await app.handle(
      new Request(`http://localhost/api/export/status/${job.id}`,),
    )).json()) as StatusBody;
    expect(status.percentage,).toBe(0,);
    const download = await app.handle(
      new Request(`http://localhost/api/export/download/${job.id}`,),
    );
    expect(download.status,).toBe(400,);
    jobs.delete(job.id,);
  },);

  test("completed jobs report full progress and download as zip", async () => {
    const job = stageJob(db, {
      status: "completed",
      progress: 3,
      total: 3,
      currentStep: "Export completed",
      zipBuffer: Buffer.from("PKfakezip"),
      createdAt: new Date("2026-01-02T03:04:05Z"),
      completedAt: new Date(),
    },);
    const status = (await (await app.handle(
      new Request(`http://localhost/api/export/status/${job.id}`,),
    )).json()) as StatusBody;
    expect(status.percentage,).toBe(100,);
    const download = await app.handle(
      new Request(`http://localhost/api/export/download/${job.id}`,),
    );
    expect(download.status,).toBe(200,);
    expect(download.headers.get("content-type"),).toBe("application/zip",);
    expect(download.headers.get("content-disposition"),).toContain("loop-lore-export-2026-01-02.zip",);
    const bytes = new Uint8Array(await download.arrayBuffer(),);
    expect(bytes.length,).toBe(9,);
    jobs.delete(job.id,);
  },);
});
