// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI execution polling (split from comfyui.ts for file size).
 * GETs `/history/<prompt_id>` and resolves the terminal state, plus the
 * deadline-bounded wait loop on top of it.
 */
import type {
  ComfyUIExecutionStatus,
  ComfyUIOutputFile,
  ComfyUIOutputKind,
} from "./comfyui";

/** Output buckets that are not `images`, in history key → media kind form. */
const NON_IMAGE_BUCKETS = [
  ["audio", "audio",],
  ["videos", "video",],
  ["gifs", "video",],
] as const;

/** Terminal state of one prompt, or not-done-yet. */
export interface ComfyUIPollResult {
  done: boolean;
  images?: ComfyUIOutputFile[];
  files?: { kind: ComfyUIOutputKind; file: ComfyUIOutputFile }[];
  error?: string;
}

/** Auth headers for proxy-fronted engines; empty for stock ComfyUI. */
function authHeaders(apiKey: string | undefined,): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${apiKey}`, } : {};
}

/**
 * Poll for execution result by prompt_id.
 * @param baseUrl - ComfyUI base URL
 * @param promptId - prompt id from submitWorkflow
 * @param apiKey - optional Bearer credential for proxy-fronted engines
 * @returns completion state with images or error
 * @throws {Error} When the history fetch returns a non-OK status.
 */
export async function pollComfyResult(
  baseUrl: string,
  promptId: string,
  apiKey?: string,
): Promise<ComfyUIPollResult> {
  const url = `${baseUrl}/history/${promptId}`;

  const resp = await fetch(url, {
    headers: authHeaders(apiKey,),
    signal: AbortSignal.timeout(10_000,),
  },);

  if (!resp.ok) {
    throw new Error(`ComfyUI history fetch failed [${resp.status}]`,);
  }

  const data = (await resp.json()) as Record<string, ComfyUIExecutionStatus>;
  const entry = data[promptId];

  if (!entry) {
    return { done: false, };
  }

  if (entry.status === "completed") {
    const images: ComfyUIOutputFile[] = [];
    const files: { kind: ComfyUIOutputKind; file: ComfyUIOutputFile }[] = [];
    if (entry.outputs) {
      for (const nodeOutput of Object.values(entry.outputs,)) {
        for (const file of nodeOutput.images ?? []) {
          images.push(file,);
          files.push({ kind: "image", file, },);
        }

        for (const [bucket, kind,] of NON_IMAGE_BUCKETS) {
          for (const file of nodeOutput[bucket] ?? []) {
            files.push({ kind, file, },);
          }
        }
      }
    }

    return { done: true, images, files, };
  }

  if (entry.status === "failed" || entry.status === "cancelled") {
    return { done: true, error: entry.error ?? `execution ${entry.status}`, };
  }

  return { done: false, };
}

/** Resolve after `ms`, for the poll loop's interval. */
function sleep(ms: number,): Promise<void> {
  const { promise, resolve, } = Promise.withResolvers<void>();
  setTimeout(resolve, ms,);
  return promise;
}

/** Options for {@link waitForComfyFiles}. */
export interface WaitForComfyFilesOptions {
  /** Max wall-clock wait before giving up. */
  timeoutMs: number;
  /** Delay between history polls. */
  pollIntervalMs: number;
  /** Optional Bearer credential for proxy-fronted engines. */
  apiKey?: string;
}

/**
 * Wait for workflow completion with polling.
 * @param baseUrl - ComfyUI base URL
 * @param promptId - the prompt_id from submitWorkflow
 * @param opts - wait tuning and the optional Bearer credential
 * @returns list of generated output files
 * @throws {Error} When execution reports failure or the deadline elapses first.
 */
export async function waitForComfyFiles(
  baseUrl: string,
  promptId: string,
  opts: WaitForComfyFilesOptions,
): Promise<{ kind: ComfyUIOutputKind; file: ComfyUIOutputFile }[]> {
  const deadline = Date.now() + opts.timeoutMs;

  while (Date.now() < deadline) {
    const result = await pollComfyResult(baseUrl, promptId, opts.apiKey,);

    if (result.done) {
      if (result.error) {
        throw new Error(`ComfyUI execution failed: ${result.error}`,);
      }

      return result.files ?? [];
    }

    await sleep(opts.pollIntervalMs,);
  }

  throw new Error("ComfyUI execution timed out",);
}
