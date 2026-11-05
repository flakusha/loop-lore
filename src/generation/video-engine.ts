// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Video generation engine — ComfyUI workflow dispatch with cross-instance
 * failover and per-instance BYO key resolution (epic-video-generation Phase
 * A: the workflow-based provider; BYOK cloud tiers stay separate).
 *
 * Workflows are template-driven from config: each `generation.providers.video`
 * entry names a workflow file under `configs/workflows/` the OPERATOR authored
 * (no video workflow ships with the repo — node packs differ per server).
 * The engine substitutes the request's prompt/seed/etc. into the graph,
 * submits it, polls to completion, and downloads the video sink.
 */

import { mimeFromExtension, } from "../assets/service/detect";
import type { VideoProviderConfig, } from "../config/schema";
import { getChildLogger, } from "../logger";
import { ComfyUIClient, } from "./providers/comfyui";
import { loadComfyUIWorkflow, } from "./workflow-loader";

/** Resolver for a provider's BYO API key, keyed by provider NAME — a key
 * stored for instance A is never handed to instance B during failover. */
export type VideoApiKeyResolver = (providerName: string,) => Promise<string | undefined>;

/** Workflow loader seam — injectable so tests skip module-level mocking. */
export type VideoWorkflowLoader = typeof loadComfyUIWorkflow;

/** Discriminated outcome: one video clip, or the failure to report. */
export type VideoGenOutcome =
  | { ok: true; buffer: Buffer; mimeType: string; providerId: string }
  | { ok: false; error: string; status: number };

/** Generation request inputs (workflow variables beyond the standard set). */
export interface VideoGenRequest {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  /** Clip length in seconds — substituted as `seconds` for time-based graphs. */
  seconds?: number;
  /** Frame count override — substituted as `frames` for frame-count graphs. */
  frames?: number;
  width?: number;
  height?: number;
}

const log = getChildLogger("video-comfyui",);

function failure(error: string, status: number,): VideoGenOutcome {
  return { ok: false, error, status, };
}

/**
 * Generate one video clip with the configured providers (ordered failover).
 *
 * The first backend returning a video sink wins; each attempt resolves its
 * own BYO key by provider name, and a stored key that FAILS to decrypt
 * aborts the whole request (fail-closed — the operator's instance credential
 * is never silently billed). Timeout maps to 504, execution failure to 502,
 * a video-less output to 503, and an unloadable workflow to 500.
 * @param providers - configured video providers (may be undefined)
 * @param request - generation request inputs
 * @param resolveApiKey - optional BYO key resolver keyed by provider name
 * @param loadWorkflow - workflow loader seam (tests inject a stub)
 * @returns the clip outcome; the LAST candidate's failure when all fail
 */
export async function generateVideoWithFailover(
  providers: VideoProviderConfig[] | undefined,
  request: VideoGenRequest,
  resolveApiKey?: VideoApiKeyResolver,
  loadWorkflow: VideoWorkflowLoader = loadComfyUIWorkflow,
): Promise<VideoGenOutcome> {
  const candidates = providers ?? [];
  if (candidates.length === 0) {
    return failure(
      "No video generation provider configured. Set config.generation.providers.video in your config file.",
      501,
    );
  }

  let last: VideoGenOutcome | undefined;
  for (const candidate of candidates) {
    const apiKey = await resolveApiKey?.(candidate.name,);
    const outcome = await runCandidate(candidate, request, apiKey, loadWorkflow,);
    if (outcome.ok) { return outcome; }

    last = outcome;
  }

  return last!;
}

/**
 * Run one provider candidate end-to-end.
 * @param candidate - the configured video provider
 * @param request - generation request inputs
 * @param apiKey - resolved credential (BYO or operator); undefined = anonymous
 * @param loadWorkflow - workflow loader seam (tests inject a stub)
 * @returns the clip outcome for this candidate
 */
async function runCandidate(
  candidate: VideoProviderConfig,
  request: VideoGenRequest,
  apiKey: string | undefined,
  loadWorkflow: VideoWorkflowLoader,
): Promise<VideoGenOutcome> {
  const client = new ComfyUIClient({
    baseUrl: candidate.baseUrl,
    timeout: candidate.generationTimeout,
    apiKey,
  },);

  let workflow;
  try {
    workflow = await loadWorkflow(candidate.workflow, {
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      seed: request.seed,
      seconds: request.seconds,
      frames: request.frames,
      width: request.width,
      height: request.height,
    },);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    log?.error("video workflow load failed", error instanceof Error ? error : undefined, {
      workflow: candidate.workflow,
    },);

    return failure(`Video workflow "${candidate.workflow}" could not be loaded: ${message}`, 500,);
  }

  try {
    // Submit → poll → download the video sink. waitForFiles (not
    // runWorkflowFiles) so the file REF survives — the sink's filename
    // determines the mime type (mp4/webm/mkv differ per node pack).
    const { prompt_id, } = await client.submitWorkflow(workflow,);
    const refs = await client.waitForFiles(prompt_id,);
    const clip = refs.find((f,) => f.kind === "video");
    if (!clip) {
      return failure("ComfyUI workflow produced no video output", 503,);
    }

    const buffer = await client.downloadFile(clip.file,);

    return {
      ok: true,
      buffer,
      mimeType: mimeFromExtension(clip.file.filename,),
      providerId: `comfyui:${candidate.workflow}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    const timedOut = message.includes("timed out",);
    log?.error("video generation failed", error instanceof Error ? error : undefined, {
      workflow: candidate.workflow,
      timedOut,
    },);

    return failure(
      timedOut
        ? `Video generation timed out after ${candidate.generationTimeout}ms`
        : `Video generation failed: ${message}`,
      timedOut ? 504 : 502,
    );
  }
}
