/**
 * Tests for the ComfyUI audio provider: provider id, workflow-load failure,
 * output-sink selection, and the run-failure branch.
 *
 * The workflow loader and the ComfyUI HTTP client are faked so no bundled
 * workflow file or server is needed.
 */
import { describe, expect, mock, test, } from "bun:test";
import { AudioApiFamily, } from "../../../db/enums-config";
import * as realWorkflowLoader from "../../workflow-loader";
import type { AudioGenRequest, } from "../types";
import { createComfyAudioProvider, } from "./comfyui";

/** Requests share one shape; only the prompt varies. */
function request(prompt: string,): AudioGenRequest {
  return { prompt, seconds: 1, };
}

describe("createComfyAudioProvider", () => {
  test("names the provider after its workflow file", () => {
    // The config gate only admits this api family; pin the wire value so a
    // schema/enum drift breaks here instead of at runtime.
    expect(AudioApiFamily.Comfyui,).toBe("comfyui",);
    const provider = createComfyAudioProvider({
      baseUrl: "http://localhost:8188",
      workflow: "txt2audio",
    },);

    expect(provider.id,).toBe("comfyui:txt2audio",);
  });

  test("maps an unloadable workflow to a 500", async () => {
    const provider = createComfyAudioProvider({ baseUrl: "http://localhost:8188", workflow: "missing", },);
    const outcome = await provider.generate(request("rain",),);

    expect(outcome.ok,).toBe(false,);
    if (outcome.ok) { return; }
    expect(outcome.status,).toBe(500,);
    expect(outcome.error,).toContain("missing",);
  });
});

describe("createComfyAudioProvider — run outcome", () => {
  const loadedWorkflow = { "1": { inputs: {}, class_type: "EmptyLatentAudio", }, };

  test("returns the audio sink buffer", async () => {
    // Spread the real barrel: mock.module persists for the whole serial run,
    // and a single-export object would leave findDeadNodes/isValidWorkflow/etc.
    // undefined for every later importer of the barrel.
    mock.module(
      "../../workflow-loader",
      () => ({ ...realWorkflowLoader, loadComfyUIWorkflow: async () => loadedWorkflow, }),
    );

    const originalFetch = globalThis.fetch;
    const calls: string[] = [];

    (globalThis as Record<string, unknown>).fetch = async (input: RequestInfo | URL,) => {
      const url = String(input,);
      calls.push(url,);
      if (url.includes("/prompt",)) { return Response.json({ prompt_id: "p1", },); }
      if (url.includes("history",)) {
        return Response.json({
          p1: {
            status: "completed",
            outputs: { "9": { audio: [{ filename: "track.wav", subfolder: "sfx", type: "output", },], }, },
          },
        },);
      }

      return new Response(new Uint8Array([1, 2, 3,],), { status: 200, },);
    };

    try {
      const { createComfyAudioProvider: make, } = await import("./comfyui");
      const provider = make({ baseUrl: "http://localhost:8188", workflow: "txt2audio", },);
      const outcome = await provider.generate(request("rain",),);

      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      expect(outcome.mimeType,).toBe("audio/wav",);
      expect(Array.from(outcome.buffer,),).toEqual([1, 2, 3,],);
      expect(calls.filter((u,) => u.includes("/view?",)),).toHaveLength(1,);
    } finally {
      (globalThis as Record<string, unknown>).fetch = originalFetch;
    }
  });

  test("maps a failed run to a 502", async () => {
    // Spread the real barrel: mock.module persists for the whole serial run,
    // and a single-export object would leave findDeadNodes/isValidWorkflow/etc.
    // undefined for every later importer of the barrel.
    mock.module(
      "../../workflow-loader",
      () => ({ ...realWorkflowLoader, loadComfyUIWorkflow: async () => loadedWorkflow, }),
    );

    const originalFetch = globalThis.fetch;
    (globalThis as Record<string, unknown>).fetch = async (input: RequestInfo | URL,) => {
      const url = String(input,);
      if (url.includes("/prompt",)) { return Response.json({ prompt_id: "p1", },); }
      if (url.includes("history",)) {
        return Response.json({ p1: { status: "failed", error: "node 9 exploded", }, },);
      }

      return new Response("nope", { status: 500, },);
    };

    try {
      const { createComfyAudioProvider: make, } = await import("./comfyui");
      // Short deadline: the failure surfaces on the first poll, so a long
      // timeout would only lengthen a hang.
      const provider = make({ baseUrl: "http://localhost:8188", workflow: "txt2audio", generationTimeout: 1_000, },);
      const outcome = await provider.generate(request("rain",),);

      expect(outcome.ok,).toBe(false,);
      if (outcome.ok) { return; }
      expect(outcome.status,).toBe(502,);
      expect(outcome.error,).toContain("node 9 exploded",);
    } finally {
      (globalThis as Record<string, unknown>).fetch = originalFetch;
    }
  });
});
