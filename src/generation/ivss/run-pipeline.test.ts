// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

import { AssetType, } from "../../db/enums";
import {
  FragmentOperation,
  FragmentStatus,
  ReferenceLane,
  ReferenceScope,
  SceneMode,
  SceneStatus,
} from "../../db/enums-generation";
import { getLogger, type Logger, setGlobalLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import type { ComfyUIOutputFile, ComfyUIOutputKind, ComfyUIWorkflow, } from "../providers/comfyui";
import { cancelVideoJob, getVideoJob, listVideoJobs, } from "../video-jobs";
import { uploadIvssReferences, } from "./reference-upload";
import {
  type IvssComfyClient,
  type IvssRunDispatch,
  type IvssWorkflowLoader,
  startIvssFragmentRun,
} from "./run-pipeline";

import {
  insertAssets,
  insertScenarioFragments,
  insertScenarioReferences,
  insertScenarios,
  insertScenarioScenes,
  insertScenarioShots,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";

const BIG_SEED = "9007199254740995";

// Resource contract: each test owns a fresh in-memory DB, temp upload dir,
// stub ComfyUI client and random ids; no test reads another test's job/asset.

describe("IVSS ComfyUI run pipeline", () => {
  let fixture: TestDb;
  let uploadDir: string;

  beforeEach(async () => {
    fixture = await createTestDb();
    uploadDir = await mkdtemp(join(tmpdir(), "ivss-run-",),);
  },);

  afterEach(async () => {
    await destroyTestDb(fixture,);
    await rm(uploadDir, { recursive: true, force: true, },);
  },);

  interface StubCalls {
    submitted: ComfyUIWorkflow[];
    waited: string[];
    downloaded: ComfyUIOutputFile[];
    cancelled: string[];
    uploaded: string[];
    masks: Array<{ filename: string; original: string }>;
  }

  const makeClient = (overrides: Partial<IvssComfyClient> = {},) => {
    const calls: StubCalls = {
      submitted: [],
      waited: [],
      downloaded: [],
      cancelled: [],
      uploaded: [],
      masks: [],
    };

    const base: IvssComfyClient = {
      async submitWorkflow(workflow,) {
        calls.submitted.push(workflow,);
        return { prompt_id: `prompt-${calls.submitted.length}`, };
      },
      async waitForFiles(promptId,) {
        calls.waited.push(promptId,);
        return [
          { kind: "video", file: { filename: "clip.webm", }, },
          { kind: "other", file: { filename: "h3-state.safetensors", }, },
        ];
      },
      async downloadFile(file,) {
        calls.downloaded.push(file,);
        return Buffer.from(`bytes:${file.filename}`,);
      },
      async cancelExecution(promptId,) {
        calls.cancelled.push(promptId ?? "",);
      },
      async uploadImage(_buffer, filename,) {
        calls.uploaded.push(filename,);
        return `comfy-${filename}`;
      },
      async uploadMask(_buffer, filename, originalRef,) {
        calls.masks.push({ filename, original: originalRef.filename, },);
        return `comfy-${filename}`;
      },
    };

    return { client: { ...base, ...overrides, }, calls, };
  };

  const makeLoader =
    (loaded: Array<{ name: string; vars: Record<string, string | number | boolean> }>,): IvssWorkflowLoader =>
    async (name, vars,) => {
      loaded.push({ name, vars, },);
      return { "1": { class_type: "StubSaveVideo", inputs: { prompt: vars.prompt, }, }, };
    };

  const immediateDispatch: IvssRunDispatch = async (opts,) => {
    await opts.run?.();
  };

  const seedScene = async () => {
    const db = fixture.db;
    const ownerId = await insertUsers(db, `owner-${randomUUID()}`, "Owner",);
    const worldId = await insertWorlds(db, ownerId, "World",);
    const scenarioId = await insertScenarios(db, worldId, ownerId, "Scenario",);
    const sceneId = await insertScenarioScenes(db, scenarioId, {
      mode: SceneMode.Image,
      seed: BIG_SEED,
      status: SceneStatus.Planned,
    },);

    const shotId = await insertScenarioShots(db, sceneId, 1500, "Dusk",);
    const fragmentId = await insertScenarioFragments(db, sceneId, FragmentOperation.Render, "h3-local", "sha256:abc", {
      shot_id: shotId,
      seed: BIG_SEED,
      status: FragmentStatus.Planned,
    },);

    return { db, ownerId, scenarioId, worldId, sceneId, fragmentId, };
  };

  const seedReferenceAsset = async (ownerId: string, filename: string,) => {
    const id = `ref-asset-${randomUUID()}`;
    const storagePath = `refs/${id}.png`;
    await mkdir(join(uploadDir, "refs",), { recursive: true, },);
    await writeFile(join(uploadDir, storagePath,), Buffer.from(`bytes:${id}`,),);
    return insertAssets(fixture.db, ownerId, filename, "image/png", AssetType.Image, 12, storagePath, {
      id,
    },);
  };

  test("stubbed ComfyUI run persists the clip", async () => {
    const seeded = await seedScene();
    const { db, ownerId, worldId, sceneId, fragmentId, } = seeded;
    const { client, calls, } = makeClient();
    const loaded: Array<{ name: string; vars: Record<string, string | number | boolean> }> = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve,) => {
      release = resolve;
    },);

    let dispatched = 0;
    const gatedDispatch: IvssRunDispatch = async (opts,) => {
      dispatched += 1;
      await gate;
      await opts.run?.();
    };

    const handle = await startIvssFragmentRun({
      database: db,
      uploadDir,
      ownerId,
      fragmentId,
      client,
      loadWorkflow: makeLoader(loaded,),
      dispatch: gatedDispatch,
      now: () => 1_700_000_000_000,
    },);

    expect(getVideoJob(handle.jobId,)?.status,).toBe("pending",);
    expect(listVideoJobs(ownerId,).some((job,) => job.id === handle.jobId),).toBe(true,);
    release?.();
    const result = await handle.done;
    if (!result.ok) { throw new Error(result.error,); }
    expect(dispatched,).toBe(1,);
    expect(calls.submitted,).toHaveLength(1,);
    expect(calls.waited,).toEqual(["prompt-1",],);
    expect(loaded[0]?.name,).toBe("h3-local",);
    expect(loaded[0]?.vars.seed,).toBe(BIG_SEED,);
    expect(String(loaded[0]?.vars.timeline_data,),).toContain("Dusk",);
    const fragment = await db.selectFrom("scenario_fragments",).selectAll()
      .where("id", "=", fragmentId,).executeTakeFirstOrThrow();

    expect(fragment.status,).toBe(FragmentStatus.Completed,);
    expect(fragment.seed,).toBe(BIG_SEED,);
    expect(fragment.output_asset_id,).toBe(result.assetId,);
    expect(fragment.latent_asset_id ?? null,).toBe(result.latentAssetId ?? null,);
    expect(fragment.output_asset_id,).not.toBe(fragment.latent_asset_id,);
    expect(fragment.prompt_snapshot,).toContain("[Shot 1]",);
    const scene = await db.selectFrom("scenario_scenes",).selectAll()
      .where("id", "=", sceneId,).executeTakeFirstOrThrow();

    expect(scene.status,).toBe(SceneStatus.Ready,);
    expect(scene.generated_asset_id,).toBe(result.assetId,);
    const links = await db.selectFrom("asset_links",).selectAll()
      .where("asset_id", "=", result.assetId,).execute();

    expect(links.some((link,) => link.entity_type === "world" && link.entity_id === worldId),).toBe(true,);
    const doneJob = getVideoJob(handle.jobId,);
    expect(doneJob?.status,).toBe("done",);
    expect(doneJob?.asset?.mimeType,).toBe(result.mimeType,);
    expect(doneJob?.asset?.filename,).toBe(result.filename,);
  });

  test("cancel before submit marks the fragment cancelled", async () => {
    const seeded = await seedScene();
    const { client, calls, } = makeClient();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve,) => {
      release = resolve;
    },);

    const gatedDispatch: IvssRunDispatch = async (opts,) => {
      await gate;
      await opts.run?.();
    };

    const handle = await startIvssFragmentRun({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      fragmentId: seeded.fragmentId,
      client,
      loadWorkflow: makeLoader([],),
      dispatch: gatedDispatch,
    },);

    await handle.cancel();
    release?.();
    const result = await handle.done;
    expect(result.ok,).toBe(false,);
    if (result.ok) { throw new Error("expected cancellation",); }
    expect(result.status,).toBe(499,);
    expect(calls.submitted,).toHaveLength(0,);
    expect(calls.cancelled,).toHaveLength(0,);
    const fragment = await seeded.db.selectFrom("scenario_fragments",).select("status",)
      .where("id", "=", seeded.fragmentId,).executeTakeFirstOrThrow();

    expect(fragment.status,).toBe(FragmentStatus.Cancelled,);
    expect(getVideoJob(handle.jobId,)?.status,).toBe("failed",);
    expect(cancelVideoJob(handle.jobId,),).toBe(false,);
  });

  test("a claimed fragment cannot be submitted twice", async () => {
    const seeded = await seedScene();
    await seeded.db.updateTable("scenario_fragments",).set({ status: FragmentStatus.Completed, },)
      .where("id", "=", seeded.fragmentId,).execute();

    const { client, } = makeClient();
    await expect(startIvssFragmentRun({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      fragmentId: seeded.fragmentId,
      client,
      loadWorkflow: makeLoader([],),
      dispatch: immediateDispatch,
    },),).rejects.toThrow("not runnable",);
  });

  test("engine failure marks the fragment and job failed", async () => {
    const seeded = await seedScene();
    const { client, } = makeClient({
      async submitWorkflow() {
        throw new Error("engine down",);
      },
    },);

    const handle = await startIvssFragmentRun({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      fragmentId: seeded.fragmentId,
      client,
      loadWorkflow: makeLoader([],),
      dispatch: immediateDispatch,
    },);

    const result = await handle.done;
    expect(result.ok,).toBe(false,);
    if (result.ok) { throw new Error("expected engine failure",); }
    expect(result.status,).toBe(502,);
    expect(result.error,).toContain("engine down",);
    const fragment = await seeded.db.selectFrom("scenario_fragments",).selectAll()
      .where("id", "=", seeded.fragmentId,).executeTakeFirstOrThrow();

    expect(fragment.status,).toBe(FragmentStatus.Failed,);
    expect(fragment.error,).toContain("engine down",);
    const scene = await seeded.db.selectFrom("scenario_scenes",).select("status",)
      .where("id", "=", seeded.sceneId,).executeTakeFirstOrThrow();

    expect(scene.status,).toBe(SceneStatus.Failed,);
    expect(getVideoJob(handle.jobId,)?.status,).toBe("failed",);
  });

  test("uploads scenario, scene and shot references before submit", async () => {
    const seeded = await seedScene();
    const shot = await seeded.db.selectFrom("scenario_shots",).select("id",)
      .where("scene_id", "=", seeded.sceneId,).executeTakeFirstOrThrow();

    const assetId = await seedReferenceAsset(seeded.ownerId, "ref.png",);

    await insertScenarioReferences(seeded.db, seeded.scenarioId, ReferenceLane.Image, assetId, {
      role: "identity",
      sort_order: 0,
    },);

    await insertScenarioReferences(seeded.db, seeded.scenarioId, ReferenceLane.Video, assetId, {
      scope: ReferenceScope.Scene,
      scene_id: seeded.sceneId,
      sort_order: 1,
      trim_out_ms: 2000,
    },);

    await insertScenarioReferences(seeded.db, seeded.scenarioId, ReferenceLane.Audio, assetId, {
      scope: ReferenceScope.Shot,
      scene_id: seeded.sceneId,
      shot_id: shot.id,
      sort_order: 2,
    },);

    const { client, calls, } = makeClient();
    const loaded: Array<{ name: string; vars: Record<string, string | number | boolean> }> = [];
    const handle = await startIvssFragmentRun({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      fragmentId: seeded.fragmentId,
      client,
      loadWorkflow: makeLoader(loaded,),
      dispatch: immediateDispatch,
    },);

    const result = await handle.done;
    expect(result.ok,).toBe(true,);
    expect(calls.uploaded,).toHaveLength(3,);
    expect(calls.masks,).toHaveLength(0,);
    const slots = JSON.parse(String(loaded[0]?.vars.reference_slots,),) as Array<{ lane: string }>;
    expect(slots.map((slot,) => slot.lane),).toEqual(["image", "video", "audio",],);

    const direct = await uploadIvssReferences({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      scenarioId: seeded.scenarioId,
      sceneId: seeded.sceneId,
      shotId: shot.id,
      client: makeClient().client,
    },);

    expect(direct,).toHaveLength(3,);
  });

  test("a mask reference overlays the preceding image", async () => {
    const seeded = await seedScene();
    const assetId = await seedReferenceAsset(seeded.ownerId, "ref.png",);
    await insertScenarioReferences(seeded.db, seeded.scenarioId, ReferenceLane.Image, assetId, {
      role: "identity",
      sort_order: 0,
    },);

    await insertScenarioReferences(seeded.db, seeded.scenarioId, ReferenceLane.Image, assetId, {
      role: "mask",
      sort_order: 1,
    },);

    const { client, calls, } = makeClient();
    const loaded: Array<{ name: string; vars: Record<string, string | number | boolean> }> = [];
    const handle = await startIvssFragmentRun({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      fragmentId: seeded.fragmentId,
      client,
      loadWorkflow: makeLoader(loaded,),
      dispatch: immediateDispatch,
    },);

    const result = await handle.done;
    expect(result.ok,).toBe(true,);
    expect(calls.uploaded,).toHaveLength(1,);
    expect(calls.masks,).toHaveLength(1,);
    expect(calls.masks[0]?.original,).toBe(`comfy-${calls.uploaded[0]}`,);
    expect(String(loaded[0]?.vars.reference_slots,),).toContain("mask",);
  });

  test("cancel during reference upload never submits", async () => {
    const seeded = await seedScene();
    const assetId = await seedReferenceAsset(seeded.ownerId, "ref.png",);
    await insertScenarioReferences(seeded.db, seeded.scenarioId, ReferenceLane.Image, assetId, {
      role: "identity",
      sort_order: 0,
    },);

    const { resolve: entered, promise: entered$, } = Promise.withResolvers<void>();
    const { resolve: release, promise: gate, } = Promise.withResolvers<void>();
    const { client, calls, } = makeClient({
      async uploadImage(_buffer, filename,) {
        calls.uploaded.push(filename,);
        entered();
        await gate;
        return `comfy-${filename}`;
      },
    },);

    const handle = await startIvssFragmentRun({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      fragmentId: seeded.fragmentId,
      client,
      loadWorkflow: makeLoader([],),
      dispatch: immediateDispatch,
    },);

    await entered$;
    await handle.cancel();
    release();
    const result = await handle.done;
    expect(result.ok,).toBe(false,);
    if (result.ok) { throw new Error("expected cancellation",); }
    expect(result.status,).toBe(499,);
    expect(calls.submitted,).toHaveLength(0,);
    expect(calls.cancelled,).toHaveLength(0,);
    const fragment = await seeded.db.selectFrom("scenario_fragments",).select("status",)
      .where("id", "=", seeded.fragmentId,).executeTakeFirstOrThrow();

    expect(fragment.status,).toBe(FragmentStatus.Cancelled,);
    expect(getVideoJob(handle.jobId,)?.status,).toBe("failed",);
  });

  test("cancel after submit cancels the remote execution once", async () => {
    const seeded = await seedScene();
    const { resolve: entered, promise: entered$, } = Promise.withResolvers<void>();
    const { resolve: release, promise: gate, } = Promise.withResolvers<
      Array<{ kind: ComfyUIOutputKind; file: ComfyUIOutputFile }>
    >();

    const { client, calls, } = makeClient({
      async waitForFiles(promptId, timeoutMs,) {
        calls.waited.push(promptId,);
        expect(timeoutMs,).toBe(300_000,);
        entered();
        return gate;
      },
    },);

    const handle = await startIvssFragmentRun({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      fragmentId: seeded.fragmentId,
      client,
      loadWorkflow: makeLoader([],),
      dispatch: immediateDispatch,
    },);

    await entered$;
    await handle.cancel();
    expect(calls.cancelled,).toEqual(["prompt-1",],);
    release([
      { kind: "video", file: { filename: "clip.webm", }, },
    ],);

    const result = await handle.done;
    expect(result.ok,).toBe(false,);
    if (result.ok) { throw new Error("expected cancellation",); }
    expect(result.status,).toBe(499,);
    expect(calls.submitted,).toHaveLength(1,);
    expect(calls.cancelled,).toEqual(["prompt-1",],);
    const fragment = await seeded.db.selectFrom("scenario_fragments",).select("status",)
      .where("id", "=", seeded.fragmentId,).executeTakeFirstOrThrow();

    expect(fragment.status,).toBe(FragmentStatus.Cancelled,);
    expect(getVideoJob(handle.jobId,)?.status,).toBe("failed",);
  });

  test("a failing remote cancel still leaves the run cancelled", async () => {
    const seeded = await seedScene();
    const { resolve: entered, promise: entered$, } = Promise.withResolvers<void>();
    const { resolve: release, promise: gate, } = Promise.withResolvers<
      Array<{ kind: ComfyUIOutputKind; file: ComfyUIOutputFile }>
    >();

    const { client, calls, } = makeClient({
      async waitForFiles(promptId,) {
        calls.waited.push(promptId,);
        entered();
        return gate;
      },
      async cancelExecution(promptId,) {
        calls.cancelled.push(promptId ?? "",);
        throw new Error("comfy refused",);
      },
    },);

    const priorLogger = getLogger();
    const cancelWarnings: unknown[] = [];
    const noop = () => {};
    const stub = {
      warn: (...args: unknown[]) => {
        cancelWarnings.push(args,);
      },
      debug: noop,
      info: noop,
      error: noop,
      child: () => stub,
    } as unknown as Logger;

    setGlobalLogger(stub,);
    try {
      const handle = await startIvssFragmentRun({
        database: seeded.db,
        uploadDir,
        ownerId: seeded.ownerId,
        fragmentId: seeded.fragmentId,
        client,
        loadWorkflow: makeLoader([],),
        dispatch: immediateDispatch,
      },);

      await entered$;
      await handle.cancel();
      release([
        { kind: "video", file: { filename: "clip.webm", }, },
      ],);

      const result = await handle.done;
      expect(result.ok,).toBe(false,);
      if (result.ok) { throw new Error("expected cancellation",); }
      expect(result.status,).toBe(499,);
      expect(calls.cancelled,).toEqual(["prompt-1",],);
      expect(
        cancelWarnings.some((entry,) => String(entry,).includes("IVSS ComfyUI cancel failed",)),
      ).toBe(true,);

      const fragment = await seeded.db.selectFrom("scenario_fragments",).select("status",)
        .where("id", "=", seeded.fragmentId,).executeTakeFirstOrThrow();

      expect(fragment.status,).toBe(FragmentStatus.Cancelled,);
    } finally {
      setGlobalLogger(priorLogger,);
    }
  });
});
