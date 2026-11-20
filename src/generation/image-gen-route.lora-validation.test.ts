// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trust-boundary tests for POST /generation/image. Invalid picks return
 * before getDatabase()/provider work, so no DB handle, HTTP stub or global
 * mock is needed here.
 */
import { expect, it, } from "bun:test";
import { handleImageGeneration, } from "./image-gen-route";

it("rejects non-finite and out-of-band LoRA strengths with 400", async () => {
  for (const strength of [1e308, Number.NaN, Number.POSITIVE_INFINITY, -101, 101,]) {
    const res = await handleImageGeneration(
      {
        prompt: "x",
        lora: { name: "style", strength, backend: "comfyui", },
      },
      undefined,
      "user-1",
    );

    expect(res.status,).toBe(400,);
    const body = await res.json() as { error: string };
    expect(body.error,).toContain("LoRA",);
  }
});

it("rejects a picked model with an invalid role extension", async () => {
  const res = await handleImageGeneration(
    {
      prompt: "x",
      clip_vision: "bad.json",
    },
    undefined,
    "user-1",
  );

  expect(res.status,).toBe(400,);
  const body = await res.json() as { error: string };
  expect(body.error,).toContain("clip_vision",);
});
