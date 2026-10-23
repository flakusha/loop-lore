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
import type { ComfyUIClient, } from "../../generation/providers/comfyui";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";
import type { ImageEditRequest, WorkflowTemplate, } from "../types";
import { uploadImageParams, } from "./comfyui-image-upload";
import { ComfyUIEditProvider, } from "./comfyui-provider";

/** The name ComfyUI reports for the uploaded file. */
const UPLOADED_NAME = "uploaded-abc.png";

let dir = "";
let localPath = "";
let restoreFetch: () => void = () => {};

/** The workflow bodies the provider submitted, captured at the /prompt POST. */
const submittedBodies: string[] = [];

/** The params the template was built with. */
const builtParams: Record<string, unknown>[] = [];

/**
 * Stands in for the ComfyUI server: no sockets, deterministic bytes.
 *
 * The /prompt POST is answered with an error on purpose: the run has to fail
 * there, so the test never reaches the asset store (which would need a
 * database and an upload directory). The submitted body is captured before
 * the failure, which is what the assertions are about.
 */
function stubComfyFetch(): () => void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit,) => {
    const url = String(input,);
    if (url.endsWith("/upload/image",)) { return Response.json({ name: UPLOADED_NAME, },); }
    if (url.endsWith("/prompt",)) {
      submittedBodies.push(String(init?.body ?? "{}",),);
      return new Response("{}", { status: 500, },);
    }

    return new Response("{}", { status: 200, },);
  }) as typeof globalThis.fetch;

  return () => {
    globalThis.fetch = realFetch;
  };
}

/** Parse a JSON body without throwing on a malformed one. */
function parseJson(text: string,): Record<string, unknown> | null {
  return jsonParseOr<Record<string, unknown> | null>(text, null,);
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
  restoreFetch = stubComfyFetch();
},);

afterAll(() => {
  restoreFetch();
  rmSync(dir, { recursive: true, force: true, },);
},);

describe("ComfyUI image-edit input upload", () => {
  test("the submitted workflow names the uploaded file, not the local path", async () => {
    submittedBodies.length = 0;
    builtParams.length = 0;

    const request: ImageEditRequest = {
      template_id: template.id,
      backend: "comfyui",
      params: { input_image: localPath, },
    };

    // The run fails at the /prompt POST (see stubComfyFetch); the body it
    // carried is the assertion target.
    await expect(new ComfyUIEditProvider().execute(request, template, { ownerId: "owner", },),)
      .rejects.toThrow();

    const submitted = parseJson(submittedBodies[0] ?? "{}",);
    const graph = (submitted?.["prompt"] as Record<string, unknown> | undefined) ?? {};
    const node = (graph["4"] as { inputs?: { image?: unknown } } | undefined)?.inputs;
    expect(node?.image,).toBe(UPLOADED_NAME,);
    expect(jsonStringifyOr(submitted,),).not.toContain(localPath,);
    expect(builtParams[0]?.["input_image"],).toBe(UPLOADED_NAME,);
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
