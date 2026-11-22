// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the honkbox artifact-delivery surface (`artifacts.ts`, `result-ingest.ts`). */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { createHash, } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, } from "node:fs";
import { join, resolve, } from "node:path";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import {
  cleanupHonkboxArtifact,
  DEFAULT_HONKBOX_ARTIFACT_MAX_BYTES,
  downloadHonkboxArtifactToTempFile,
  getHonkboxArtifactBytes,
  HONKBOX_ARTIFACTS_PATH,
  honkboxArtifactByteCap,
  HonkboxArtifactDeliveryUnavailableError,
  HonkboxArtifactValidationError,
  putHonkboxArtifact,
} from "./artifacts";
import { type HonkboxProbeSuccess, parseHonkboxCapabilities, } from "./index";
import {
  type HonkboxJobEvent,
  type HonkboxNsfwAnnotation,
  ingestHonkboxJobResult,
  parseHonkboxJobEvent,
  selectHonkboxArtifact,
} from "./result-ingest";

const originalFetch = globalThis.fetch;

/** Repo-local gitignored scratch root for per-test sandboxes. */
const SANDBOX_ROOT = resolve(import.meta.dir, "../../../.tmp",);
mkdirSync(SANDBOX_ROOT, { recursive: true, },);

afterAll(() => {
  globalThis.fetch = originalFetch;
},);

/** Probe with artifact delivery and a present storage data dir. */
function deliveryProbe(): HonkboxProbeSuccess {
  const parsed = parseHonkboxCapabilities({
    api_version: "v1",
    features: { artifact_delivery: true, },
    storage: { data_dir_present: true, },
    openapi: "/v1/openapi.json",
    models: "/v1/models",
  },);

  if (!parsed.ok) { throw new Error("delivery probe fixture did not parse",); }
  return { ok: true, capabilities: parsed.capabilities, supported: true, latencyMs: 1, };
}

/** Swap globalThis.fetch for the duration of `fn`. */
async function withMockFetch(
  handler: (url: string,) => Response | Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  globalThis.fetch = (async (url: string | URL | Request,) => handler(String(url,),)) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const GLB_BYTES = Buffer.from("glTFbinary-fixture-bytes",);
const GLB_SHA256 = createHash("sha256",).update(GLB_BYTES,).digest("hex",);

describe("selectHonkboxArtifact", () => {
  test("explicit id wins, no id selects first, no frames yields undefined", () => {
    const frames: HonkboxJobEvent[] = [
      { event: "job_result", cancelled: false, artifactId: "a", },
      { event: "job_result", cancelled: false, artifactId: "b", },
      { event: "job_progress", cancelled: false, artifactId: "c", },
    ];

    expect(selectHonkboxArtifact([], {},),).toBeUndefined();
    expect(selectHonkboxArtifact(frames, {},)?.artifactId,).toBe("a",);
    expect(selectHonkboxArtifact(frames, { artifactId: "b", },)?.artifactId,).toBe("b",);
    expect(selectHonkboxArtifact(frames, { artifactId: "missing", },)?.artifactId,).toBe("a",);
  });

  test("artifact-less frames are never selection candidates", () => {
    const frames: HonkboxJobEvent[] = [
      {
        event: "job_result",
        cancelled: false,
        annotations: [
          { score: 0.6, classes: ["x",], modelVersion: "v1", },
        ],
      },
      { event: "job_result", cancelled: false, artifactId: "real", },
    ];

    expect(frames[0]?.artifactId,).toBeUndefined();
    expect(selectHonkboxArtifact(frames, {},)?.artifactId,).toBe("real",);
  });

  test("the primary frame beats the first frame", () => {
    const frames: HonkboxJobEvent[] = [
      { event: "job_result", cancelled: false, artifactId: "map", artifactIndex: 0, },
      {
        event: "job_result",
        cancelled: false,
        artifactId: "model",
        artifactIndex: 1,
        artifactPrimary: true,
      },
    ];

    expect(selectHonkboxArtifact(frames, {},)?.artifactId,).toBe("model",);
  });

  test("an explicit artifact id beats the primary frame", () => {
    const frames: HonkboxJobEvent[] = [
      { event: "job_result", cancelled: false, artifactId: "map", artifactIndex: 0, },
      {
        event: "job_result",
        cancelled: false,
        artifactId: "model",
        artifactIndex: 1,
        artifactPrimary: true,
      },
    ];

    expect(selectHonkboxArtifact(frames, { artifactId: "map", },)?.artifactId,).toBe("map",);
  });

  test("without a primary the lowest artifact index wins", () => {
    const frames: HonkboxJobEvent[] = [
      { event: "job_result", cancelled: false, artifactId: "second", artifactIndex: 1, },
      { event: "job_result", cancelled: false, artifactId: "first", artifactIndex: 0, },
    ];

    expect(selectHonkboxArtifact(frames, {},)?.artifactId,).toBe("first",);
  });

  test("frames without selection metadata keep the first-frame fallback", () => {
    const frames: HonkboxJobEvent[] = [
      { event: "job_result", cancelled: false, artifactId: "a", },
      { event: "job_result", cancelled: false, artifactId: "b", },
    ];

    expect(selectHonkboxArtifact(frames, {},)?.artifactId,).toBe("a",);
    expect(selectHonkboxArtifact([], {},),).toBeUndefined();
  });
});

describe("artifact registry constants", () => {
  test("collection path and default byte cap are stable", () => {
    expect(HONKBOX_ARTIFACTS_PATH,).toBe("/artifacts",);
    expect(DEFAULT_HONKBOX_ARTIFACT_MAX_BYTES,).toBe(64 * 1_048_576,);
  });

  test("error classes carry their names", () => {
    expect(new HonkboxArtifactDeliveryUnavailableError("x",).name,).toBe(
      "HonkboxArtifactDeliveryUnavailableError",
    );

    expect(new HonkboxArtifactValidationError("x",).name,).toBe("HonkboxArtifactValidationError",);
  });

  test("byte cap falls back to the floor without a probed limit", () => {
    expect(honkboxArtifactByteCap(deliveryProbe().capabilities,),).toBe(
      DEFAULT_HONKBOX_ARTIFACT_MAX_BYTES,
    );
  });
});

describe("parseHonkboxJobEvent", () => {
  test("parses a result frame with artifact identity", () => {
    const event = parseHonkboxJobEvent({
      event: "job_result",
      id: "job-1",
      artifact_id: "a1",
      size_bytes: 4,
      sha256: GLB_SHA256,
    }, "job_result",);

    expect(event?.event,).toBe("job_result",);
    expect(event?.artifactId,).toBe("a1",);
    expect(event?.sizeBytes,).toBe(4,);
    expect(event?.sha256,).toBe(GLB_SHA256,);
    expect(event?.cancelled,).toBe(false,);
  });

  test("rejects non-objects and result frames without an artifact", () => {
    expect(parseHonkboxJobEvent(null, "job_result",),).toBeUndefined();
    expect(parseHonkboxJobEvent("nope", "job_result",),).toBeUndefined();
    expect(parseHonkboxJobEvent({ event: "job_result", }, "job_result",),).toBeUndefined();
  });

  test("marks cancelled frames", () => {
    const event = parseHonkboxJobEvent({ event: "job_cancelled", id: "job-1", cancelled: true, }, "job_cancelled",);
    expect(event?.event,).toBe("job_cancelled",);
    expect(event?.cancelled,).toBe(true,);
  });

  test("retains an annotated artifact-less result frame", () => {
    const event = parseHonkboxJobEvent({
      event: "job_result",
      id: "job-nsfw",
      annotations: [{ score: 0.4, classes: ["sfw",], model_version: "v1", },],
    }, "job_result",);

    expect(event?.artifactId,).toBeUndefined();
    expect(event?.annotations,).toEqual([
      { score: 0.4, classes: ["sfw",], modelVersion: "v1", },
    ],);
  });

  test("drops malformed annotations without throwing", () => {
    const event = parseHonkboxJobEvent({
      event: "job_result",
      annotations: [
        { score: 0.5, classes: ["ok",], model_version: "v1", },
        null,
        { score: "high", classes: [], model_version: "v1", },
        { score: 1.4, classes: [], model_version: "v1", },
        { score: 0.5, classes: [], model_version: "", },
        { score: 0.2, classes: ["a", 3, null, "b",], model_version: "v2", },
        { score: 0.3, classes: "nope", model_version: "v3", },
      ],
    }, "job_result",);

    expect(event?.annotations,).toEqual([
      { score: 0.5, classes: ["ok",], modelVersion: "v1", },
      { score: 0.2, classes: ["a", "b",], modelVersion: "v2", },
      { score: 0.3, classes: [], modelVersion: "v3", },
    ],);

    expect(parseHonkboxJobEvent({
      event: "job_result",
      annotations: "nope",
    }, "job_result",),).toBeUndefined();
  });

  test("parses artifact selection metadata when present", () => {
    const event = parseHonkboxJobEvent({
      event: "job_result",
      artifact_id: "a1",
      artifact_name: "export.glb",
      artifact_kind: "model",
      artifact_index: 1,
      artifact_primary: true,
    }, "job_result",);

    expect(event?.artifactName,).toBe("export.glb",);
    expect(event?.artifactKind,).toBe("model",);
    expect(event?.artifactIndex,).toBe(1,);
    expect(event?.artifactPrimary,).toBe(true,);
  });

  test("drops absent and wrong-typed artifact selection metadata", () => {
    const absent = parseHonkboxJobEvent({ event: "job_result", artifact_id: "a1", }, "job_result",);
    expect(absent?.artifactId,).toBe("a1",);
    expect(absent?.artifactName,).toBeUndefined();
    expect(absent?.artifactKind,).toBeUndefined();
    expect(absent?.artifactIndex,).toBeUndefined();
    expect(absent?.artifactPrimary,).toBeUndefined();

    const wrong = parseHonkboxJobEvent({
      event: "job_result",
      artifact_id: "a1",
      artifact_name: 7,
      artifact_kind: {},
      artifact_index: "1",
      artifact_primary: "yes",
    }, "job_result",);

    expect(wrong?.artifactId,).toBe("a1",);
    expect(wrong?.artifactName,).toBeUndefined();
    expect(wrong?.artifactKind,).toBeUndefined();
    expect(wrong?.artifactIndex,).toBeUndefined();
    expect(wrong?.artifactPrimary,).toBeUndefined();
  });
});

describe("artifact store client", () => {
  test("putHonkboxArtifact refuses bytes over the cap before any I/O", async () => {
    await expect(putHonkboxArtifact(
      { baseUrl: "http://127.0.0.1:9010/v1", maxBytes: 2, },
      Buffer.from("three",),
      "model/gltf-binary",
    ),).rejects.toBeInstanceOf(HonkboxArtifactValidationError,);
  });

  test("putHonkboxArtifact returns the server descriptor", async () => {
    await withMockFetch(async () =>
      new Response(
        JSON.stringify({ artifact_id: "a1", sha256: GLB_SHA256, size_bytes: GLB_BYTES.length, },),
        { headers: { "content-type": "application/json", }, },
      ), async () => {
      const stored = await putHonkboxArtifact(
        { baseUrl: "http://127.0.0.1:9010/v1", maxBytes: 1024, },
        GLB_BYTES,
        "model/gltf-binary",
      );

      expect(stored.artifactId,).toBe("a1",);
      expect(stored.sha256,).toBe(GLB_SHA256,);
      expect(stored.sizeBytes,).toBe(GLB_BYTES.length,);
    },);
  });

  test("download stages bytes to a temp file and cleanup removes the dir", async () => {
    await withMockFetch(async () =>
      new Response(
        GLB_BYTES,
        {
          headers: {
            "content-type": "model/gltf-binary",
            "content-range": `bytes 0-${GLB_BYTES.length - 1}/${GLB_BYTES.length}`,
          },
        },
      ), async () => {
      const client = { baseUrl: "http://127.0.0.1:9010/v1", maxBytes: 1024, };
      const downloaded = await downloadHonkboxArtifactToTempFile(client, "a1",);
      expect(downloaded.sizeBytes,).toBe(GLB_BYTES.length,);
      expect(downloaded.sha256,).toBe(GLB_SHA256,);
      expect(downloaded.contentType,).toBe("model/gltf-binary",);
      expect(existsSync(downloaded.path,),).toBe(true,);

      const bytes = await getHonkboxArtifactBytes(client, "a1",);
      expect(await bytes.text(),).toBe(GLB_BYTES.toString(),);

      await cleanupHonkboxArtifact(downloaded,);
      expect(existsSync(join(downloaded.path, "..",),),).toBe(false,);
    },);
  });
});

describe("ingestHonkboxJobResult", () => {
  let fixture: TestDb;
  let uploadDir: string;

  beforeAll(async () => {
    fixture = await createTestDb();
  },);

  afterAll(async () => {
    await destroyTestDb(fixture,);
  },);

  // Owns: one upload sandbox per test, so a red test cannot leak files into the next.
  beforeEach(() => {
    uploadDir = mkdtempSync(join(SANDBOX_ROOT, "hb-ingest-",),);
  },);

  afterEach(() => {
    rmSync(uploadDir, { recursive: true, force: true, },);
  },);

  /** @param db - test database
   * @param username - login to look up
   * @returns the user id
   */
  async function ownerIdFor(db: TestDb["db"], username: string,): Promise<string> {
    return (await db.selectFrom("users",).select("id",).where(
      "username",
      "=",
      username,
    ).executeTakeFirstOrThrow()).id;
  }

  test("no-result when neither the stream nor the snapshot carries an artifact", async () => {
    const outcome = await ingestHonkboxJobResult({
      baseUrl: "http://127.0.0.1:9010/v1",
      probe: deliveryProbe(),
      events: new Response('event: job_progress\ndata: {"id":"job-9"}\n\n',),
      jobId: "job-9",
      database: fixture.db,
      uploadDir,
      ownerId: "owner-no-result",
      links: [],
      listJobs: async () => [],
    },);

    expect(outcome.ok,).toBe(false,);
    if (outcome.ok) { return; }
    expect(outcome.reason,).toBe("no-result",);
  });

  test("cancelled wins over a later result", async () => {
    const outcome = await ingestHonkboxJobResult({
      baseUrl: "http://127.0.0.1:9010/v1",
      probe: deliveryProbe(),
      events: new Response('event: job_cancelled\ndata: {"id":"job-2"}\n\n',),
      jobId: "job-2",
      database: fixture.db,
      uploadDir,
      ownerId: "owner-cancelled",
      links: [],
      listJobs: async () => [],
    },);

    expect(outcome.ok,).toBe(false,);
    if (outcome.ok) { return; }
    expect(outcome.reason,).toBe("cancelled",);
  });

  test("failed jobs report failure without ingesting", async () => {
    const outcome = await ingestHonkboxJobResult({
      baseUrl: "http://127.0.0.1:9010/v1",
      probe: deliveryProbe(),
      events: new Response('event: job_finished\ndata: {"id":"job-3","status":"failed"}\n\n',),
      jobId: "job-3",
      database: fixture.db,
      uploadDir,
      ownerId: "owner-failed",
      links: [],
      listJobs: async () => [],
    },);

    expect(outcome.ok,).toBe(false,);
    if (outcome.ok) { return; }
    expect(outcome.reason,).toBe("failed",);
  });

  test("a matching result persists a model asset", async () => {
    await insertUsers(fixture.db, "hb-owner", "Honkbox Owner",);
    const ownerId = await ownerIdFor(fixture.db, "hb-owner",);
    const frame = {
      event: "job_result",
      id: "job-4",
      artifact_id: "a4",
      size_bytes: GLB_BYTES.length,
      sha256: GLB_SHA256,
    };

    await withMockFetch(async () =>
      new Response(
        GLB_BYTES,
        {
          headers: {
            "content-type": "model/gltf-binary",
            "content-range": `bytes 0-${GLB_BYTES.length - 1}/${GLB_BYTES.length}`,
          },
        },
      ), async () => {
      const outcome = await ingestHonkboxJobResult({
        baseUrl: "http://127.0.0.1:9010/v1",
        probe: deliveryProbe(),
        events: new Response(`event: job_result\ndata: ${JSON.stringify(frame,)}\n\n`,),
        jobId: "job-4",
        database: fixture.db,
        uploadDir,
        ownerId,
        links: [],
        listJobs: async () => [],
      },);

      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      expect(outcome.artifactId,).toBe("a4",);
      expect(outcome.sha256,).toBe(GLB_SHA256,);
      expect(outcome.sizeBytes,).toBe(GLB_BYTES.length,);
      expect(outcome.asset.asset_type,).toBe("model",);
      expect(outcome.asset.filename,).toBe(`${GLB_SHA256}.glb`,);
    },);
  });

  /** @param jobId - unique job id for this fixture
   * @returns two ordered result frames plus id-routed bytes for the mock fetch
   */
  function multiFrameFixture(jobId: string,) {
    const ids = [`${jobId}-a`, `${jobId}-b`,];
    const bytes = [Buffer.from(`${jobId}-alpha`,), Buffer.from(`${jobId}-beta`,),];
    const hashes = bytes.map(
      (value,) => createHash("sha256",).update(value,).digest("hex",),
    );

    const frames = ids.map((artifactId, index,) => ({
      event: "job_result",
      id: jobId,
      artifact_id: artifactId,
      size_bytes: bytes[index]!.length,
      sha256: hashes[index]!,
    }));

    return {
      ids,
      hashes,
      frames,
      stream: [
        ...frames.map((frame,) => `event: job_result\ndata: ${JSON.stringify(frame,)}\n\n`),
        `event: job_finished\ndata: ${JSON.stringify({ id: jobId, },)}\n\n`,
      ].join("",),
      fetchFor: (url: string,) => {
        const id = decodeURIComponent(
          url.split("/artifacts/", 2,)[1]?.split("/", 1,)[0] ?? "",
        );

        const index = ids.indexOf(id,);
        const value = bytes[index < 0 ? 0 : index]!;
        return new Response(value, {
          headers: {
            "content-type": "image/png",
            "content-range": `bytes 0-${value.length - 1}/${value.length}`,
          },
        },);
      },
    };
  }

  test("explicit artifact id selects the later of two results", async () => {
    await insertUsers(fixture.db, "hb-multi-explicit", "Honkbox Multi Explicit",);
    const ownerId = await ownerIdFor(fixture.db, "hb-multi-explicit",);
    const { ids, hashes, stream, fetchFor, } = multiFrameFixture("job-multi-explicit",);
    await withMockFetch(fetchFor, async () => {
      const outcome = await ingestHonkboxJobResult({
        baseUrl: "http://127.0.0.1:9010/v1",
        probe: deliveryProbe(),
        events: new Response(stream,),
        jobId: "job-multi-explicit",
        database: fixture.db,
        uploadDir,
        ownerId,
        links: [],
        listJobs: async () => [],
        artifactId: ids[1],
      },);

      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      expect(outcome.artifactId,).toBe(ids[1]!,);
      expect(outcome.sha256,).toBe(hashes[1]!,);
    },);
  });

  test("no explicit id selects the first of two results", async () => {
    await insertUsers(fixture.db, "hb-multi-first", "Honkbox Multi First",);
    const ownerId = await ownerIdFor(fixture.db, "hb-multi-first",);
    const { ids, hashes, stream, fetchFor, } = multiFrameFixture("job-multi-first",);
    await withMockFetch(fetchFor, async () => {
      const outcome = await ingestHonkboxJobResult({
        baseUrl: "http://127.0.0.1:9010/v1",
        probe: deliveryProbe(),
        events: new Response(stream,),
        jobId: "job-multi-first",
        database: fixture.db,
        uploadDir,
        ownerId,
        links: [],
        listJobs: async () => [],
      },);

      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      expect(outcome.artifactId,).toBe(ids[0]!,);
      expect(outcome.sha256,).toBe(hashes[0]!,);
    },);
  });

  test("annotation re-emit is surfaced without becoming an asset", async () => {
    await insertUsers(fixture.db, "hb-nsfw-owner", "Honkbox NSFW Owner",);
    const ownerId = await ownerIdFor(fixture.db, "hb-nsfw-owner",);
    const bytes = Buffer.from("hb-nsfw-image",);
    const hash = createHash("sha256",).update(bytes,).digest("hex",);
    const annotationFrame = {
      event: "job_result",
      id: "job-nsfw",
      annotations: [
        { score: 0.75, classes: ["explicit", 7, "violence",], model_version: "nsfw-v2", },
        { score: "bad", classes: ["x",], model_version: "v0", },
      ],
    };

    const resultFrame = {
      event: "job_result",
      id: "job-nsfw",
      artifact_id: "nsfw-a",
      size_bytes: bytes.length,
      sha256: hash,
    };

    const stream = [
      `event: job_result\ndata: ${JSON.stringify(annotationFrame,)}\n\n`,
      `event: job_result\ndata: ${JSON.stringify(resultFrame,)}\n\n`,
      `event: job_finished\ndata: ${JSON.stringify({ id: "job-nsfw", },)}\n\n`,
    ].join("",);

    const observed: (readonly HonkboxNsfwAnnotation[])[] = [];

    await withMockFetch(() =>
      new Response(bytes, {
        headers: {
          "content-type": "image/png",
          "content-range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
        },
      },), async () => {
      const outcome = await ingestHonkboxJobResult({
        baseUrl: "http://127.0.0.1:9010/v1",
        probe: deliveryProbe(),
        events: new Response(stream,),
        jobId: "job-nsfw",
        database: fixture.db,
        uploadDir,
        ownerId,
        links: [],
        listJobs: async () => [],
        onAnnotations: (annotations,) => {
          observed.push(annotations,);
        },
      },);

      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      expect(outcome.artifactId,).toBe("nsfw-a",);
      expect(outcome.annotations,).toEqual([
        { score: 0.75, classes: ["explicit", "violence",], modelVersion: "nsfw-v2", },
      ],);

      expect(observed,).toHaveLength(1,);
      expect(observed[0],).toEqual(outcome.annotations,);
    },);
  });

  /** Blender recipe pair: the map is emitted first, the model is primary.
   * @param jobId - unique job id for this fixture
   * @returns two ordered result frames plus id-routed bytes for the mock fetch
   */
  function blenderFixture(jobId: string,) {
    const ids = [`${jobId}-map`, `${jobId}-glb`,];
    const bytes = [Buffer.from(`${jobId}-map-bytes`,), GLB_BYTES,];
    const hashes = bytes.map(
      (value,) => createHash("sha256",).update(value,).digest("hex",),
    );

    const frames = [
      {
        event: "job_result",
        id: jobId,
        artifact_id: ids[0]!,
        artifact_name: "recipe_map.png",
        artifact_kind: "map",
        artifact_index: 0,
        artifact_primary: false,
        size_bytes: bytes[0]!.length,
        sha256: hashes[0]!,
      },
      {
        event: "job_result",
        id: jobId,
        artifact_id: ids[1]!,
        artifact_name: "export.glb",
        artifact_kind: "model",
        artifact_index: 1,
        artifact_primary: true,
        size_bytes: bytes[1]!.length,
        sha256: hashes[1]!,
      },
    ];

    return {
      ids,
      hashes,
      frames,
      stream: [
        ...frames.map((frame,) => `event: job_result\ndata: ${JSON.stringify(frame,)}\n\n`),
        `event: job_finished\ndata: ${JSON.stringify({ id: jobId, },)}\n\n`,
      ].join("",),
      fetchFor: (url: string,) => {
        const id = decodeURIComponent(
          url.split("/artifacts/", 2,)[1]?.split("/", 1,)[0] ?? "",
        );

        const index = ids.indexOf(id,);
        const value = bytes[index < 0 ? 0 : index]!;
        return new Response(value, {
          headers: {
            "content-type": index === 1 ? "model/gltf-binary" : "image/png",
            "content-range": `bytes 0-${value.length - 1}/${value.length}`,
          },
        },);
      },
    };
  }

  // Owns: the "hb-blender" user row, one mock artifact fetch and one upload sandbox.
  test("a blender-shaped stream ingests the primary model, not the first map frame", async () => {
    await insertUsers(fixture.db, "hb-blender", "Honkbox Blender",);
    const ownerId = await ownerIdFor(fixture.db, "hb-blender",);
    const { ids, hashes, stream, fetchFor, } = blenderFixture("job-blender",);
    await withMockFetch(fetchFor, async () => {
      const outcome = await ingestHonkboxJobResult({
        baseUrl: "http://127.0.0.1:9010/v1",
        probe: deliveryProbe(),
        events: new Response(stream,),
        jobId: "job-blender",
        database: fixture.db,
        uploadDir,
        ownerId,
        links: [],
        listJobs: async () => [],
      },);

      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      expect(outcome.artifactId,).toBe(ids[1]!,);
      expect(outcome.sha256,).toBe(hashes[1]!,);
      expect(outcome.asset.asset_type,).toBe("model",);
    },);
  });

  // Owns: the "hb-snapshot-new" user row, one mock artifact fetch and one upload sandbox.
  test("a new-shape snapshot row recovers the primary artifact", async () => {
    await insertUsers(fixture.db, "hb-snapshot-new", "Honkbox Snapshot New",);
    const ownerId = await ownerIdFor(fixture.db, "hb-snapshot-new",);
    const jobId = "job-snapshot-new";
    const bytes = Buffer.from("snapshot-primary-bytes",);

    await withMockFetch(async () =>
      new Response(bytes, {
        headers: {
          "content-type": "model/gltf-binary",
          "content-range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
        },
      },), async () => {
      const outcome = await ingestHonkboxJobResult({
        baseUrl: "http://127.0.0.1:9010/v1",
        probe: deliveryProbe(),
        events: new Response(
          `event: job_progress\ndata: ${JSON.stringify({ id: jobId, },)}\n\n`,
        ),
        jobId,
        database: fixture.db,
        uploadDir,
        ownerId,
        links: [],
        listJobs: async () => ({
          object: "list",
          data: [{
            id: jobId,
            kind: "blender",
            artifacts: [
              {
                artifact_id: "snap-map",
                name: "recipe_map.png",
                kind: "map",
                index: 0,
                primary: false,
              },
              {
                artifact_id: "snap-glb",
                name: "export.glb",
                kind: "model",
                index: 1,
                primary: true,
              },
            ],
          },],
        }),
      },);

      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      expect(outcome.artifactId,).toBe("snap-glb",);
    },);
  });

  // Owns: the "hb-snapshot-old" user row, one mock artifact fetch and one upload sandbox.
  test("an old-shape snapshot row still recovers its top-level artifact", async () => {
    await insertUsers(fixture.db, "hb-snapshot-old", "Honkbox Snapshot Old",);
    const ownerId = await ownerIdFor(fixture.db, "hb-snapshot-old",);
    const jobId = "job-snapshot-old";
    const bytes = Buffer.from("snapshot-old-bytes",);
    const hash = createHash("sha256",).update(bytes,).digest("hex",);

    await withMockFetch(async () =>
      new Response(bytes, {
        headers: {
          "content-type": "model/gltf-binary",
          "content-range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
        },
      },), async () => {
      const outcome = await ingestHonkboxJobResult({
        baseUrl: "http://127.0.0.1:9010/v1",
        probe: deliveryProbe(),
        events: new Response(
          `event: job_progress\ndata: ${JSON.stringify({ id: jobId, },)}\n\n`,
        ),
        jobId,
        database: fixture.db,
        uploadDir,
        ownerId,
        links: [],
        listJobs: async () => ({
          object: "list",
          data: [{ id: jobId, artifact_id: "old-artifact", sha256: hash, size_bytes: bytes.length, },],
        }),
      },);

      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      expect(outcome.artifactId,).toBe("old-artifact",);
      expect(outcome.sha256,).toBe(hash,);
    },);
  });

  test("a single result frame is unchanged", async () => {
    await insertUsers(fixture.db, "hb-multi-single", "Honkbox Multi Single",);
    const ownerId = await ownerIdFor(fixture.db, "hb-multi-single",);
    const { ids, hashes, frames, fetchFor, } = multiFrameFixture("job-multi-single",);
    const stream = `event: job_result\ndata: ${JSON.stringify(frames[0],)}\n\n`;
    await withMockFetch(fetchFor, async () => {
      const outcome = await ingestHonkboxJobResult({
        baseUrl: "http://127.0.0.1:9010/v1",
        probe: deliveryProbe(),
        events: new Response(stream,),
        jobId: "job-multi-single",
        database: fixture.db,
        uploadDir,
        ownerId,
        links: [],
        listJobs: async () => [],
      },);

      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      expect(outcome.artifactId,).toBe(ids[0]!,);
      expect(outcome.sha256,).toBe(hashes[0]!,);
    },);
  });
});
