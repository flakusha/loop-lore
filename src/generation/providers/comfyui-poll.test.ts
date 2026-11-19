// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, test, } from "bun:test";
import { latentPackageDescriptor, pollComfyResult, } from "./comfyui-poll";

const originalFetch = globalThis.fetch;

/** Point fetch at one completed history entry with the given node outputs. */
function stubHistory(outputs: Record<string, unknown>,): void {
  (globalThis as Record<string, unknown>).fetch = async () =>
    Response.json({
      p1: { status: { status_str: "success", completed: true, }, outputs, },
    },);
}

/** Kinds of every polled file, in history order. */
async function polledKinds(): Promise<string[]> {
  const result = await pollComfyResult("http://x", "p1",);
  return (result.files ?? []).map((entry,) => entry.kind);
}

describe("pollComfyResult output classification", () => {
  afterEach(() => {
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  },);

  test("maps core SaveVideo images bucket with animated marker to video", async () => {
    stubHistory({ "9": { images: [{ filename: "clip.mp4", },], animated: [true,], }, },);
    expect(await polledKinds(),).toEqual(["video",],);
  });

  test("maps a video container in the images bucket without a marker", async () => {
    stubHistory({ "9": { images: [{ filename: "legacy.mp4", },], }, },);
    expect(await polledKinds(),).toEqual(["video",],);
  });

  test("keeps plain images as images", async () => {
    stubHistory({ "9": { images: [{ filename: "still.png", },], }, },);
    expect(await polledKinds(),).toEqual(["image",],);
  });

  test("keeps gifs as video and maps the files bucket to other", async () => {
    stubHistory({
      "9": {
        gifs: [{ filename: "clip.webm", format: "video/webm", },],
        files: [{ filename: "latent.safetensors", },],
      },
    },);

    expect(await polledKinds(),).toEqual(["video", "other",],);
  });

  test("maps an absolute package_path output to a view-fetchable latent descriptor", async () => {
    stubHistory({
      "9": { package_path: ["/home/user/comfy/output/h3_lq_stash/proj/shot1",], },
    },);

    const result = await pollComfyResult("http://x", "p1",);
    expect(result.files,).toEqual([
      {
        kind: "other",
        file: {
          filename: "latent.safetensors",
          subfolder: "h3_lq_stash/proj/shot1",
          type: "output",
        },
      },
    ],);
  });

  test("maps bare and output-prefixed package_path forms ending at the latent file", async () => {
    stubHistory({
      "9": { package_path: ["output/h3_lq_stash/proj/shot1/latent.safetensors",], },
    },);

    const result = await pollComfyResult("http://x", "p1",);
    expect(result.files,).toEqual([
      {
        kind: "other",
        file: {
          filename: "latent.safetensors",
          subfolder: "h3_lq_stash/proj/shot1",
          type: "output",
        },
      },
    ],);
  });

  test("ignores non-matching package_path strings and keeps bucket files first", async () => {
    stubHistory({
      "9": {
        files: [{ filename: "h3-state.safetensors", },],
        package_path: ["/tmp/elsewhere/latent.safetensors", "not a path", 42,],
      },
    },);

    const result = await pollComfyResult("http://x", "p1",);
    expect(result.files,).toEqual([
      { kind: "other", file: { filename: "h3-state.safetensors", }, },
    ],);
  });
});

describe("latentPackageDescriptor", () => {
  test("maps absolute and bare package paths to the latent file", () => {
    expect(latentPackageDescriptor("/a/output/h3_lq_stash/proj/shot1",),).toEqual({
      filename: "latent.safetensors",
      subfolder: "h3_lq_stash/proj/shot1",
      type: "output",
    },);

    expect(latentPackageDescriptor("h3_lq_stash/proj/shot1/latent.safetensors",)?.subfolder,).toBe(
      "h3_lq_stash/proj/shot1",
    );
  });

  test("rejects non-package strings", () => {
    expect(latentPackageDescriptor("not a path",),).toBeUndefined();
    expect(latentPackageDescriptor(42,),).toBeUndefined();
  });
});
