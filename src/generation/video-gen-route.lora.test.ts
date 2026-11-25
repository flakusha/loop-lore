// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trust-boundary test for the video route LoRA gate. The refusal runs before
 * any DB/provider work, so this file needs no fixtures or module mocks.
 */
import { expect, it, } from "bun:test";
import { handleVideoGeneration, } from "./video-gen-route";

it("fails closed on a LoRA request instead of returning a LoRA-free clip", async () => {
  const res = await handleVideoGeneration(
    {
      prompt: "a clip",
      lora: { name: "style.safetensors", strength: 0.7, backend: "comfyui", },
    },
    undefined,
    "video-lora-user",
    "user",
  );

  expect(res.status,).toBe(400,);
  const body = await res.json() as { error: string };
  expect(body.error,).toContain("LoRA",);
  expect(body.error,).toContain("cannot apply",);
});
