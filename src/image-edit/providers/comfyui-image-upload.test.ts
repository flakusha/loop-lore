// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The ComfyUI image-edit provider uploads a local input image before it
 * submits the workflow, so the `LoadImage` node names a file ComfyUI has the
 * bytes for. Without the upload the workflow carries a path ComfyUI never
 * received and the run fails at execution time with an opaque error.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Config, } from "../../config/schema";
import type { ComfyUIClient, ComfyUIWorkflow, } from "../../generation/providers/comfyui";
import { createLogger, } from "../../logger";
import { jsonStringifyOr, } from "../../utils";
import type { ImageEditRequest, WorkflowTemplate, } from "../types";
import { uploadImageParams, } from "./comfyui-image-upload";
import { ComfyUIEditProvider, } from "./comfyui-provider";

/** The name ComfyUI reports for the uploaded file. */
const UPLOADED_NAME = "uploaded-abc.png";

// The provider reads the config, and the config loader logs. Without a root
// logger that read throws, and the test would fail for a reason of its own.
createLogger({ level: "error", },);

let dir = "";
let localPath = "";

/** The workflow the provider handed to ComfyUI. */
const submitted: ComfyUIWorkflow[] = [];

/** The params the template was built with. */
const builtParams: Record<string, unknown>[] = [];

/** The uploads the provider made. */
const uploads: { filename: string; bytes: number }[] = [];

/**
 * A provider whose client talks to no server.
 *
 * The client is injected rather than stubbed at `globalThis.fetch`: another
 * test file in this directory stubs the global too, and under a parallel test
 * run the two stubs overwrite each other — the file that lost the race saw an
 * empty request and failed for no reason of its own.
 */
class StubbedProvider extends ComfyUIEditProvider {
  protected override getClient(_config?: Config,): ComfyUIClient {
    return {
      uploadImage: async (buffer: Buffer, filename: string,) => {
        uploads.push({ filename, bytes: buffer.byteLength, },);
        return UPLOADED_NAME;
      },
      // The run stops at the submission: everything the test is about
      // happened before it.
      submitWorkflow: async (workflow: ComfyUIWorkflow,) => {
        submitted.push(workflow,);
        throw new Error("stub: the run stops at the submission",);
      },
    } as unknown as ComfyUIClient;
  }
}

const template: WorkflowTemplate = {
  id: "upload-probe",
  name: "Upload Probe",
  description: "stub",
  category: "img2img",
  backends: ["comfyui",],
  required_nodes: [],
  parameters: [
    { name: "input_image", type: "image", label: "Input Image", default: "", required: true, },
  ],
  build: (params: Record<string, unknown>,) => {
    builtParams.push(params,);
    return {
      "4": {
        inputs: { image: params["input_image"], },
        class_type: "LoadImage",
      },
    };
  },
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "loop-lore-comfy-upload-",),);
  localPath = join(dir, "source.png",);
  writeFileSync(localPath, Buffer.from([0x89, 0x50, 0x4e, 0x47,],),);
},);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true, },);
},);

describe("ComfyUI image-edit input upload", () => {
  test("the submitted workflow names the uploaded file, not the local path", async () => {
    submitted.length = 0;
    builtParams.length = 0;
    uploads.length = 0;

    const request: ImageEditRequest = {
      template_id: template.id,
      backend: "comfyui",
      params: { input_image: localPath, },
    };

    await expect(new StubbedProvider().execute(request, template, { ownerId: "owner", },),)
      .rejects.toThrow(/stops at the submission/,);

    // The upload happened, and it happened before the workflow was built.
    expect(uploads.length,).toBe(1,);
    expect(builtParams[0]?.["input_image"],).toBe(UPLOADED_NAME,);

    // The stored name is unique, so two runs of the same source image cannot
    // overwrite each other's bytes in ComfyUI's input directory.
    expect(uploads[0]?.filename,).not.toBe("source.png",);
    expect(uploads[0]?.filename,).toEndWith(".png",);

    const graph = submitted[0]!;
    const node = (graph["4"] as { inputs?: { image?: unknown } } | undefined)?.inputs;
    expect(node?.image,).toBe(UPLOADED_NAME,);
    expect(jsonStringifyOr(graph,),).not.toContain(localPath,);
  });

  test("a base64 data URI is uploaded like a local file", async () => {
    const params: Record<string, unknown> = {
      input_image: `data:image/png;base64,${Buffer.from([1, 2, 3, 4,],).toString("base64",)}`,
    };

    const sent: { filename: string; bytes: number }[] = [];
    const client = {
      uploadImage: async (buffer: Buffer, filename: string,) => {
        sent.push({ filename, bytes: buffer.byteLength, },);
        return UPLOADED_NAME;
      },
    } as unknown as ComfyUIClient;

    await uploadImageParams({ client, template, params, },);

    expect(sent.length,).toBe(1,);
    expect(sent[0]?.bytes,).toBe(4,);
    expect(params["input_image"],).toBe(UPLOADED_NAME,);
  });

  test("a name that is already a ComfyUI input file is left alone", async () => {
    const params: Record<string, unknown> = { input_image: "already-uploaded.png", };

    await uploadImageParams({ client: stubClient(), template, params, },);

    expect(params["input_image"],).toBe("already-uploaded.png",);
  });

  test("an unreadable local path fails the run instead of queuing a dangling name", async () => {
    const params: Record<string, unknown> = { input_image: join(dir, "missing.png",), };

    await expect(uploadImageParams({ client: stubClient(), template, params, },),)
      .rejects.toThrow(/not readable/,);

    expect(params["input_image"],).toBe(join(dir, "missing.png",),);
  });
});

/** A client that only implements the upload call the helper makes. */
function stubClient(): ComfyUIClient {
  return { uploadImage: async () => UPLOADED_NAME, } as unknown as ComfyUIClient;
}
