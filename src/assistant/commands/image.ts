// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /image — Generate an image from a text prompt.
 *
 * Three branches per EPIC-2026-23:
 *   1. No provider configured → clear systemMessage + `available: false`
 *      so `listCommands()` filters it out (mirrors BUG-advertised-sfx-music-video).
 *   2. Provider configured but unreachable → systemMessage + retry action
 *      with `requires_user_action: true`.
 *   3. Provider configured and reachable → frontend dispatch via the existing
 *      `action: "generate-image"` payload (POST /api/generation/image). The
 *      route handler already calls `generateImages()` which routes to the
 *      configured backend (ComfyUI primary, sd-server secondary).
 *
 * @module assistant/commands/image
 */

import { loadConfig, } from "../../config/load";
import { ComfyUIClient, type ComfyUIWorkflow, } from "../../generation/providers/comfyui";
import { type ImageProviderResolution, resolveImageProvider, } from "../image-provider";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";

/** Optional deps for test injection. Mirrors `/translate`'s `TranslateDeps`. */
export interface ImageDeps {
  /** Override the provider resolver (test seam). Defaults to `resolveImageProvider(loadConfig())`. */
  resolve?: (config: Parameters<typeof resolveImageProvider>[0],) => ImageProviderResolution;
  /**
   * Reachability probe — returns `false` or throws to mark the provider
   * unreachable; returns `true` to commit to branch 3. Defaults to
   * `undefined` (assumed reachable when a provider is configured) to match
   * the existing `/image` behavior for users with a live backend.
   */
  probe?: (resolution: ImageProviderResolution,) => Promise<boolean> | boolean;
  /**
   * Optional submission driver used for branch 3. Production code path
   * dispatches through the frontend `action: "generate-image"` (the route
   * then calls the actual backend). Supplying `submit` short-circuits that
   * loop for tests; it returns the prompt id or null on failure.
   */
  submit?: (workflow: ComfyUIWorkflow, client: ComfyUIClient,) => Promise<string | null>;
}

/** Test escape: flip the registry availability flag without re-importing. */
let imageAvailableOverride: boolean | null = null;

/** Cached handler reference so we can re-register when the override flips. */
const imageCommandHandler = async (args: string[], ctx: CommandContext,): Promise<CommandResult> =>
  runImage(args, ctx,);

/**
 * Toggle the registry availability flag. Pass `null` to restore auto-detection.
 * Re-registers the handler so the new value takes effect on `listCommands()`.
 * @param available
 */
export function _setImageAvailabilityForTest(available: boolean | null,): void {
  imageAvailableOverride = available;
  const resolved = available ?? resolveImageCommandAvailability();
  registerCommand("image", imageCommandHandler, { available: resolved, },);
}

/**
 * Core `/image` logic. Extractable so tests can inject stub providers/probes
 * without going through the registered handler.
 * @param args - Command args (everything after `/image`)
 * @param ctx - Command context
 * @param deps - Injected test seams
 * @returns well-formed `CommandResult`
 */
export async function runImage(
  args: string[],
  ctx: CommandContext,
  deps: ImageDeps = {},
): Promise<CommandResult> {
  const prompt = args.join(" ",).trim();

  if (!prompt) {
    return {
      systemMessage:
        "Usage: /image <prompt> — generate an image from text.\nExample: /image A medieval castle at sunset",
      handled: true,
    };
  }

  const resolve = deps.resolve ?? ((c,) => resolveImageProvider(c,));
  const resolution = resolve(ctx.config,);

  // Branch 1: no provider configured.
  if (resolution.backend === "none") {
    return {
      systemMessage: "Image generation is not configured on this instance. See docs/setup for ComfyUI or sd.cpp setup.",
      handled: true,
    };
  }

  // Reachability probe (branch 2 vs 3).
  let reachable = true;
  if (deps.probe) {
    try {
      reachable = await deps.probe(resolution,);
    } catch {
      reachable = false;
    }
  }

  // Branch 2: provider configured but unreachable.
  if (!reachable) {
    return {
      systemMessage:
        `Image generation: configured provider unreachable — check that the ${resolution.backend} backend is running and reachable.`,
      action: "generate-image",
      actionPayload: {
        prompt,
        backend: resolution.backend,
        requires_user_action: true,
      },
      handled: true,
    };
  }

  // Branch 3: provider configured + reachable.
  if (deps.submit) {
    const { client, } = resolution;
    const workflow: ComfyUIWorkflow = {
      "1": {
        inputs: { prompt, seed: Math.floor(Math.random() * 1e9,), },
        class_type: "PositivePromptStub",
        _meta: { title: "Prompt", },
      },
    };
    const promptId = await deps.submit(workflow, client,);
    return {
      action: "generate-image",
      actionPayload: {
        prompt,
        workflow_template: undefined,
        backend: resolution.backend,
        ...(promptId ? { prompt_id: promptId, } : { requires_user_action: true, }),
      },
      handled: true,
    };
  }

  return {
    action: "generate-image",
    actionPayload: {
      prompt,
      workflow_template: undefined,
      backend: resolution.backend,
    },
    handled: true,
  };
}

/**
 * Decide whether `/image` should appear in `listCommands()`. Mirrors the
 * `BUG-advertised-sfx-music-video-commands-are-stubs` pattern by hiding
 * the command when no provider is configured.
 * @returns availability flag
 */
function resolveImageCommandAvailability(): boolean {
  if (imageAvailableOverride !== null) { return imageAvailableOverride; }
  try {
    const config = loadConfig();
    return resolveImageProvider(config,).backend !== "none";
  } catch {
    return false;
  }
}

/**
 * Module-load: register `/image` and gate its `available:` flag on the
 * configured provider snapshot. Tests can flip availability via
 * `_setImageAvailabilityForTest(bool | null)`.
 *
 * ponytail: once-per-module-load probe. Hot reload of config won't update
 * availability; restart the server (or set the override) to re-evaluate.
 * Matches the sfx/music/video registration pattern.
 */
registerCommand(
  "image",
  imageCommandHandler,
  { available: resolveImageCommandAvailability(), },
);
