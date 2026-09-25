// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for src/assistant/commands/image.ts — three-branch coverage of the
 * /image command handler per EPIC-2026-23.
 *
 * Branches:
 *   1. No provider configured → plain systemMessage, no action.
 *   2. Provider configured but unreachable → systemMessage + retry action
 *      with `requires_user_action: true`.
 *   3. Provider configured + reachable → frontend dispatch payload
 *      (`action: "generate-image"`) with backend + (optional) prompt_id.
 *
 * No live ComfyUI server required — deps are injected.
 */
import { afterEach, beforeAll, describe, expect, it, } from "bun:test";
import { ComfyUIClient, } from "../../generation/providers/comfyui";
import { createLogger, } from "../../logger";
import { _setImageAvailabilityForTest, runImage, } from "./image";
import { type CommandContext, getCommand, listCommands, } from "./registry";

const ctx: CommandContext = { chatId: "test-chat", config: undefined, };

beforeAll(() => {
  createLogger({ level: "error", },);
},);

afterEach(() => {
  _setImageAvailabilityForTest(null,);
},);

describe("/image command — three branches", () => {
  it("branch 1: no provider configured → systemMessage, no action, handled", async () => {
    const result = await runImage(["a mountain at dawn",], ctx, {
      resolve: () => ({ backend: "none", reason: "no provider configured", }),
    },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("not configured",);
    expect(result.systemMessage,).toContain("docs/setup",);
    expect(result.action,).toBeUndefined();
    expect(result.actionPayload,).toBeUndefined();
  });

  it("branch 2: provider configured but probe says unreachable → requires_user_action=true", async () => {
    const fakeClient = {} as unknown as ComfyUIClient;
    const result = await runImage(["a mountain at dawn",], ctx, {
      resolve: () => ({
        backend: "comfyui",
        client: fakeClient,
        config: {
          name: "x",
          label: "x",
          baseUrl: "http://127.0.0.1:8188",
          apiFamily: "comfyui",
          defaults: { width: 0, height: 0, steps: 0, cfgScale: 0, sampler: "", },
          timeout: 0,
          generationTimeout: 0,
        },
      }),
      probe: () => false,
    },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("configured provider unreachable",);
    expect(result.action,).toBe("generate-image",);
    expect(result.actionPayload,).toMatchObject({
      prompt: "a mountain at dawn",
      backend: "comfyui",
      requires_user_action: true,
    },);
  });

  it("branch 2 (probe throws): provider probe throw is treated as unreachable", async () => {
    const fakeClient = {} as unknown as ComfyUIClient;
    const result = await runImage(["x",], ctx, {
      resolve: () => ({
        backend: "sd-server",
        client: fakeClient,
        config: {
          name: "y",
          label: "y",
          baseUrl: "http://127.0.0.1:7860",
          apiFamily: "sdapi",
          defaults: { width: 0, height: 0, steps: 0, cfgScale: 0, sampler: "", },
          timeout: 0,
          generationTimeout: 0,
        },
      }),
      probe: () => {
        throw new Error("ECONNREFUSED",);
      },
    },);
    expect(result.actionPayload?.requires_user_action,).toBe(true,);
    expect(result.systemMessage,).toContain("sd-server",);
  });

  it("branch 3: provider reachable + submit returns id → action contains prompt_id, no requires_user_action", async () => {
    const fakeClient = {} as unknown as ComfyUIClient;
    const result = await runImage(["a castle on a hill",], ctx, {
      resolve: () => ({
        backend: "comfyui",
        client: fakeClient,
        config: {
          name: "ok",
          label: "ok",
          baseUrl: "http://127.0.0.1:8188",
          apiFamily: "comfyui",
          defaults: { width: 0, height: 0, steps: 0, cfgScale: 0, sampler: "", },
          timeout: 0,
          generationTimeout: 0,
        },
      }),
      probe: () => true,
      submit: async (_wf, _c,) => "prompt-abc-123",
    },);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("generate-image",);
    expect(result.actionPayload,).toMatchObject({
      prompt: "a castle on a hill",
      backend: "comfyui",
      prompt_id: "prompt-abc-123",
    },);
    expect(result.actionPayload,).not.toHaveProperty("requires_user_action",);
  });

  it("branch 3 (no submit): reachable provider falls through to frontend dispatch", async () => {
    const fakeClient = {} as unknown as ComfyUIClient;
    const result = await runImage(["a lake at sunset",], ctx, {
      resolve: () => ({
        backend: "sd-server",
        client: fakeClient,
        config: {
          name: "ok",
          label: "ok",
          baseUrl: "http://127.0.0.1:7860",
          apiFamily: "sdapi",
          defaults: { width: 0, height: 0, steps: 0, cfgScale: 0, sampler: "", },
          timeout: 0,
          generationTimeout: 0,
        },
      }),
      probe: () => true,
      // no submit → production path: frontend re-issues POST /api/generation/image
    },);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("generate-image",);
    expect(result.actionPayload,).toMatchObject({
      prompt: "a lake at sunset",
      backend: "sd-server",
    },);
    expect(result.actionPayload,).not.toHaveProperty("requires_user_action",);
    expect(result.actionPayload,).not.toHaveProperty("prompt_id",);
  });

  it("usage message wins when no prompt is supplied", async () => {
    const result = await runImage([], ctx, {
      resolve: () => ({
        backend: "comfyui",
        client: {} as unknown as ComfyUIClient,
        config: {
          name: "x",
          label: "x",
          baseUrl: "http://x",
          apiFamily: "comfyui",
          defaults: { width: 0, height: 0, steps: 0, cfgScale: 0, sampler: "", },
          timeout: 0,
          generationTimeout: 0,
        },
      }),
    },);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Usage: /image",);
  });

  it("uses live resolveImageProvider when no deps.resolve is injected (no-provider branch)", async () => {
    const result = await runImage(["x",], { chatId: "c", config: undefined, }, {},);
    // Default config has no `sd` providers → expected to land on branch 1
    // OR crash on loadConfig() (depending on env). Either way, handled must be true.
    expect(result.handled,).toBe(true,);
    expect(result.action ?? null,).not.toBe("generate-image",);
  });
});

describe("/image command — registration", () => {
  it("handler is registered under name 'image'", () => {
    expect(getCommand("image",),).toBeDefined();
  });

  it("listCommands() excludes /image when test override is set to false", () => {
    _setImageAvailabilityForTest(false,);
    expect(listCommands(),).not.toContain("image",);
  });

  it("listCommands() includes /image when test override is set to true", () => {
    _setImageAvailabilityForTest(true,);
    expect(listCommands(),).toContain("image",);
  });

  it("reset to null restores auto-detection of the resolver", () => {
    _setImageAvailabilityForTest(null,);
    // Just verify no throw — the actual value depends on process env config.
    expect(listCommands(),).toBeDefined();
  });
});
