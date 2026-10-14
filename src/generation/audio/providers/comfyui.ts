// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI audio provider — submits an operator-authored audio workflow
 * (e.g. Stable Audio Open via whatever node pack their server has),
 * downloads the audio sinks, and returns the first track.
 *
 * Node names differ per ComfyUI node pack, so no workflow JSON ships with the
 * repo: the operator points `workflow` at their own file in `configs/workflows/`.
 */
import { getChildLogger, } from "../../../logger";
import { ComfyUIClient, } from "../../providers/comfyui";
import { loadComfyUIWorkflow, } from "../../workflow-loader";
import type { AudioGenOutcome, AudioGenRequest, AudioProvider, } from "../types";

/** */
export interface ComfyAudioProviderOptions {
  baseUrl: string;
  /** Workflow name under `configs/workflows/` (e.g. "txt2audio"). */
  workflow: string;
  /** Generation deadline in ms (default 300s). */
  generationTimeout?: number;
}

/**
 * Create a ComfyUI-backed audio provider.
 * @param opts
 * @returns The provider; `generate` fails with 500 (bad workflow file),
 * 502 (server error), or 503 (no audio sink in the output).
 */
export function createComfyAudioProvider(opts: ComfyAudioProviderOptions,): AudioProvider {
  const log = getChildLogger("audio-comfyui",);
  const client = new ComfyUIClient({ baseUrl: opts.baseUrl, timeout: opts.generationTimeout ?? 300_000, },);

  return {
    id: `comfyui:${opts.workflow}`,
    async generate(request: AudioGenRequest,): Promise<AudioGenOutcome> {
      let workflow;
      try {
        workflow = await loadComfyUIWorkflow(opts.workflow, {
          prompt: request.prompt,
          seconds: request.seconds,
          seed: request.seed,
        },);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error,);
        log?.error("audio workflow load failed", error instanceof Error ? error : undefined, {
          workflow: opts.workflow,
        },);

        return { ok: false, error: `Audio workflow "${opts.workflow}" could not be loaded: ${message}`, status: 500, };
      }

      try {
        const files = await client.runWorkflowFiles(workflow,);
        const track = files.find((f,) => f.kind === "audio");
        if (!track) {
          return { ok: false, error: "ComfyUI workflow produced no audio output", status: 503, };
        }

        return { ok: true, buffer: track.buffer, mimeType: "audio/wav", };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error,);
        log?.error("audio generation failed", error instanceof Error ? error : undefined, {
          workflow: opts.workflow,
        },);

        return { ok: false, error: `Audio generation failed: ${message}`, status: 502, };
      }
    },
  };
}
