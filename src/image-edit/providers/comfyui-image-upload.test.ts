// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The ComfyUI image-edit provider uploads the input image before it submits
 * the workflow, so the `LoadImage` node names a file ComfyUI has the bytes
 * for. Without the upload the workflow carries a value ComfyUI never
 * received and the run fails at execution time with an opaque error.
 *
 * The bytes come from an asset the caller owns: the parameter carries the
 * asset id, and the provider resolves it through the ownership check. A path
 * on this machine is never read — the parameter is caller-controlled, so
 * reading it would hand any caller the bytes of any file the server can read.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { extname, join, } from "node:path";
import { createAsset, } from "../../assets/service";
import { makeMinimalPng, } from "../../assets/test-helpers";
import type { Config, } from "../../config/schema";
import { setTestDatabase, } from "../../db";
import type { DB, } from "../../db/schema";
import type { ComfyUIClient, ComfyUIWorkflow, } from "../../generation/providers/comfyui";
import { rowToTemplate, } from "../../generation/workflow-library/row";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { controlnet, } from "../templates/builtin/controlnet";
import { img2img, } from "../templates/builtin/img2img";
import { inpaint, } from "../templates/builtin/inpaint";
import { upscale, } from "../templates/builtin/upscale";
import type { ImageEditRequest, WorkflowTemplate, } from "../types";
import { uploadImageParams, } from "./comfyui-image-upload";
import { ComfyUIEditProvider, } from "./comfyui-provider";

/** The bytes of the image the caller owns. */
const IMAGE = makeMinimalPng(4, 4,);

// The provider reads the config, and the config loader logs. Without a root
// logger that read throws, and the test would fail for a reason of its own.
createLogger({ level: "error", },);

/** The uploads the client received. */
const uploads: { filename: string; stored: string; bytes: number }[] = [];

/** The workflows the client was asked to submit. */
const submitted: ComfyUIWorkflow[] = [];

/** A template that loads one image, like the built-in img2img. */
const probe: WorkflowTemplate = {
  id: "upload-probe",
  name: "Upload Probe",
  description: "stub",
  category: "img2img",
  backends: ["comfyui",],
  required_nodes: [],
  parameters: [
    { name: "input_image", type: "image", label: "Input Image", default: "", required: true, },
  ],
  build: (params: Record<string, unknown>,) => ({
    "4": { inputs: { image: params["input_image"], }, class_type: "LoadImage", },
  }),
};

/** A template that loads no image at all. */
const textOnly: WorkflowTemplate = {
  ...probe,
  id: "text-only",
  category: "txt2img",
  parameters: [{ name: "prompt", type: "string", label: "Prompt", default: "", required: true, },],
  build: () => ({}),
};

/**
 * A client that records the upload and stops the run at the submission.
 *
 * The client is injected rather than stubbed at `globalThis.fetch`: another
 * test file in this directory stubs the global too, and under a parallel test
 * run the two stubs overwrite each other — the file that lost the race saw an
 * empty request and failed for no reason of its own.
 * @param failAt - 1-based upload that fails, when the run must abort
 * @returns {ComfyUIClient} the recording client
 */
function stubClient(failAt?: number,): ComfyUIClient {
  return {
    uploadImage: async (buffer: Buffer, filename: string,) => {
      if (failAt !== undefined && uploads.length + 1 === failAt) {
        throw new Error("ComfyUI refused the upload",);
      }

      // ComfyUI answers with the name it stored the bytes under, which is not
      // the name the caller sent: the graph must carry the answer, not the ask.
      const stored = `comfy-${uploads.length + 1}${extname(filename,)}`;
      uploads.push({ filename, stored, bytes: buffer.byteLength, },);
      return stored;
    },
    submitWorkflow: async (workflow: ComfyUIWorkflow,) => {
      submitted.push(workflow,);
      throw new Error("stub: the run stops at the submission",);
    },
  } as unknown as ComfyUIClient;
}

/** A provider whose client talks to no server. */
class StubbedProvider extends ComfyUIEditProvider {
  protected override getClient(_config?: Config,): ComfyUIClient {
    return stubClient();
  }
}

let db: Kysely<DB>;
let uploadDir = "";
const owner = uid();
const stranger = uid();

beforeAll(async () => {
  uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-image-edit-upload-",),);
  const testDb = await createTestDb();
  db = testDb.db;
  setTestDatabase(db,);
  await insertUsers(db, `user-${owner}`, "Owner", { id: owner, } as never,);
  await insertUsers(db, `user-${stranger}`, "Stranger", { id: stranger, } as never,);
},);

afterAll(async () => {
  setTestDatabase(null,);
  await db.destroy();
  rmSync(uploadDir, { recursive: true, force: true, },);
},);

/**
 * Store an image asset owned by the given user.
 * @param ownerId - Owner of the asset
 * @param mimeType - Mime type the asset is stored as
 * @returns {Promise<string>} the asset id
 */
async function seedAsset(ownerId: string, mimeType = "image/png",): Promise<string> {
  const { asset, } = await createAsset({
    database: db,
    uploadDir,
    input: {
      ownerId,
      filename: "input.png",
      mimeType,
      assetType: "image",
      sizeBytes: IMAGE.byteLength,
      buffer: IMAGE,
      // Two assets of the same owner with the same bytes are two assets.
      dedupe: false,
    },
  },);

  return asset.id;
}

/**
 * The message a failing run reports.
 * @param run - The run to attempt
 * @returns {Promise<string>} the error message
 */
async function failureMessage(run: () => Promise<unknown>,): Promise<string> {
  try {
    await run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error,);
  }

  throw new Error("expected the run to fail",);
}

describe("ComfyUI image-edit input upload", () => {
  test("uploads the bytes of the asset the caller owns and substitutes the returned name", async () => {
    uploads.length = 0;
    const assetId = await seedAsset(owner,);
    const params: Record<string, unknown> = { input_image: assetId, };

    await uploadImageParams({
      client: stubClient(),
      template: probe,
      params,
      database: db,
      uploadDir,
      ownerId: owner,
    },);

    expect(uploads.length,).toBe(1,);
    expect(uploads[0]?.bytes,).toBe(IMAGE.byteLength,);
    // The parameter carries the name ComfyUI answered with, not the asset id.
    expect(params["input_image"],).toBe("comfy-1.png",);
  });

  test("the stored name is unique per run, so two runs cannot overwrite each other", async () => {
    uploads.length = 0;
    const assetId = await seedAsset(owner,);

    await uploadImageParams({
      client: stubClient(),
      template: probe,
      params: { input_image: assetId, },
      database: db,
      uploadDir,
      ownerId: owner,
    },);

    await uploadImageParams({
      client: stubClient(),
      template: probe,
      params: { input_image: assetId, },
      database: db,
      uploadDir,
      ownerId: owner,
    },);

    expect(uploads.length,).toBe(2,);
    expect(uploads[0]?.filename,).not.toBe(uploads[1]?.filename,);
  });

  test("the mime type picks the extension ComfyUI's loader expects", async () => {
    uploads.length = 0;
    const assetId = await seedAsset(owner, "image/jpeg",);

    await uploadImageParams({
      client: stubClient(),
      template: probe,
      params: { input_image: assetId, },
      database: db,
      uploadDir,
      ownerId: owner,
    },);

    expect(uploads.length,).toBe(1,);
    expect(uploads[0]?.filename,).toEndWith(".jpg",);
  });

  test("an asset the caller does not own is refused, and nothing is uploaded", async () => {
    uploads.length = 0;
    const assetId = await seedAsset(stranger,);

    const message = await failureMessage(async () => {
      await uploadImageParams({
        client: stubClient(),
        template: probe,
        params: { input_image: assetId, },
        database: db,
        uploadDir,
        ownerId: owner,
      },);
    },);

    expect(message,).toContain("input_image",);
    expect(uploads.length,).toBe(0,);
  });

  test("an unknown asset id fails exactly like an asset owned by someone else", async () => {
    const strangerAsset = await seedAsset(stranger,);

    const foreign = await failureMessage(async () => {
      await uploadImageParams({
        client: stubClient(),
        template: probe,
        params: { input_image: strangerAsset, },
        database: db,
        uploadDir,
        ownerId: owner,
      },);
    },);

    const missing = await failureMessage(async () => {
      await uploadImageParams({
        client: stubClient(),
        template: probe,
        params: { input_image: uid(), },
        database: db,
        uploadDir,
        ownerId: owner,
      },);
    },);

    // An asset id is not authorization: the two answers must not differ, or
    // the error becomes an existence oracle on ids the caller guessed.
    expect(missing,).toBe(foreign,);
  });

  test("an asset id with SQL metacharacters resolves like any unknown id", async () => {
    uploads.length = 0;
    const before = await db.selectFrom("assets",).selectAll().execute();

    for (const assetId of ["'; DROP TABLE assets; --", "x' OR 1=1 --",]) {
      const message = await failureMessage(async () => {
        await uploadImageParams({
          client: stubClient(),
          template: probe,
          params: { input_image: assetId, },
          database: db,
          uploadDir,
          ownerId: owner,
        },);
      },);

      // The id is bound, never concatenated into SQL text: the answer is the
      // ordinary "not found" one, and no other row is matched.
      expect(message,).toContain("not found or not owned",);
    }

    const after = await db.selectFrom("assets",).selectAll().execute();
    expect(after.length,).toBe(before.length,);
    expect(uploads.length,).toBe(0,);
  });

  test("a path on this machine is never read", async () => {
    uploads.length = 0;
    // A real file on this machine: reading it would hand the caller the bytes
    // of any file the server can read.
    const path = join(import.meta.dir, "comfyui-image-upload.test.ts",);

    const message = await failureMessage(async () => {
      await uploadImageParams({
        client: stubClient(),
        template: probe,
        params: { input_image: path, },
        database: db,
        uploadDir,
        ownerId: owner,
      },);
    },);

    expect(message,).toContain("input_image",);
    expect(uploads.length,).toBe(0,);
  });

  test("a template with two images uploads both, and a failed upload names the parameter", async () => {
    uploads.length = 0;
    const twoImages: WorkflowTemplate = {
      ...probe,
      id: "two-images",
      parameters: [
        { name: "input_image", type: "image", label: "Input Image", default: "", required: true, },
        { name: "mask_image", type: "image", label: "Mask Image", default: "", required: true, },
      ],
    };

    const params: Record<string, unknown> = {
      input_image: await seedAsset(owner,),
      mask_image: await seedAsset(owner,),
    };

    const message = await failureMessage(async () => {
      await uploadImageParams({
        client: stubClient(2,),
        template: twoImages,
        params,
        database: db,
        uploadDir,
        ownerId: owner,
      },);
    },);

    expect(message,).toContain("mask_image",);
    // The first upload happened; the second one aborted the run.
    expect(uploads.length,).toBe(1,);
  });

  test("the submitted workflow names the uploaded file, not the asset id", async () => {
    uploads.length = 0;
    submitted.length = 0;
    const assetId = await seedAsset(owner,);
    const request: ImageEditRequest = {
      template_id: probe.id,
      backend: "comfyui",
      params: { input_image: assetId, },
    };

    await expect(new StubbedProvider({ uploadDir, },).execute(request, probe, { ownerId: owner, },),)
      .rejects.toThrow(/stops at the submission/,);

    expect(uploads.length,).toBe(1,);
    const graph = submitted[0]!;
    const node = (graph["4"] as { inputs?: { image?: unknown } } | undefined)?.inputs;
    expect(node?.image,).toBe("comfy-1.png",);
    expect(JSON.stringify(graph,),).not.toContain(assetId,);
  });

  test("every built-in template that loads an image binds the uploaded name", async () => {
    for (const template of [img2img, upscale, inpaint, controlnet,]) {
      uploads.length = 0;
      submitted.length = 0;
      const params: Record<string, unknown> = {};
      const assetIds: string[] = [];
      for (const parameter of template.parameters) {
        if (parameter.type !== "image") { continue; }
        const assetId = await seedAsset(owner,);
        assetIds.push(assetId,);
        params[parameter.name] = assetId;
      }

      const request: ImageEditRequest = { template_id: template.id, backend: "comfyui", params, };
      await expect(new StubbedProvider({ uploadDir, },).execute(request, template, { ownerId: owner, },),)
        .rejects.toThrow(/stops at the submission/,);

      const returned = uploads.map((upload,) => upload.stored);
      expect(uploads.length,).toBe(assetIds.length,);
      const graph = submitted[0]!;
      const loaders = Object.values(graph,).filter(
        (node,) => (node as { class_type?: string }).class_type === "LoadImage",
      );

      expect(loaders.length,).toBeGreaterThan(0,);
      for (const loader of loaders) {
        const image = (loader as { inputs?: { image?: string } }).inputs?.image;
        expect(image,).toBeDefined();
        // The node names a file ComfyUI has the bytes for, never the asset id.
        expect(returned,).toContain(image!,);
        expect(assetIds,).not.toContain(image!,);
      }
    }
  });

  test("a library row that declares an image parameter uploads it too", async () => {
    uploads.length = 0;
    submitted.length = 0;
    const assetId = await seedAsset(owner,);
    // An operator-created workflow row declares its own parameters, so the
    // provider reads the image the same way it reads a built-in template's.
    const template = rowToTemplate({
      id: "row-img2img",
      name: "Row img2img",
      description: null,
      model_family: null,
      payload: JSON.stringify({
        body: { "4": { class_type: "LoadImage", inputs: { image: "{{input_image}}", }, }, },
        category: "img2img",
        parameters: [{ name: "input_image", type: "image", label: "Input Image", default: "", required: true, },],
        requiredNodes: ["LoadImage",],
      },),
      is_default: "false",
      enabled: "enabled",
      lora_slots: null,
      min_vram: null,
    },);

    expect(template,).not.toBeNull();

    const request: ImageEditRequest = {
      template_id: "row-img2img",
      backend: "comfyui",
      params: { input_image: assetId, },
    };

    await expect(new StubbedProvider({ uploadDir, },).execute(request, template!, { ownerId: owner, },),)
      .rejects.toThrow(/stops at the submission/,);

    expect(uploads.length,).toBe(1,);
    const node = (submitted[0]!["4"] as { inputs?: { image?: unknown } } | undefined)?.inputs;
    // The node names the file ComfyUI stored the bytes under, never the asset id.
    expect(node?.image,).toBe(uploads[0]!.stored,);
    expect(JSON.stringify(submitted[0]!,),).not.toContain(assetId,);
  });

  test("a template with no image parameter is submitted unchanged", async () => {
    uploads.length = 0;
    submitted.length = 0;
    const request: ImageEditRequest = {
      template_id: textOnly.id,
      backend: "comfyui",
      params: { prompt: "a cat", },
    };

    await expect(new StubbedProvider({ uploadDir, },).execute(request, textOnly, { ownerId: owner, },),)
      .rejects.toThrow(/stops at the submission/,);

    expect(uploads.length,).toBe(0,);
    expect(submitted.length,).toBe(1,);
  });

  test("a run whose input image cannot be resolved never reaches the submission", async () => {
    uploads.length = 0;
    submitted.length = 0;
    const request: ImageEditRequest = {
      template_id: probe.id,
      backend: "comfyui",
      params: { input_image: uid(), },
    };

    await expect(new StubbedProvider({ uploadDir, },).execute(request, probe, { ownerId: owner, },),)
      .rejects.toThrow(/input_image/,);

    expect(submitted.length,).toBe(0,);
  });
});
