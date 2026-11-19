// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, test, } from "bun:test";
import { pollComfyResult, } from "./comfyui-poll";

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
});
