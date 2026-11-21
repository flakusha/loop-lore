// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI execution polling (split from comfyui.ts for file size).
 * GETs `/history/<prompt_id>` and resolves the terminal state, plus the
 * deadline-bounded wait loop on top of it.
 */
import type {
  ComfyUIExecutionStatus,
  ComfyUINodeOutput,
  ComfyUIOutputFile,
  ComfyUIOutputKind,
} from "./comfyui";

/** Output buckets that are not `images`, in history key → media kind form. */
const NON_IMAGE_BUCKETS = [
  ["audio", "audio",],
  ["videos", "video",],
  ["gifs", "video",],
  ["files", "other",],
] as const;

/** Core SaveVideo emits `animated: (True,)`, which JSON serializes as [true]. */
function isAnimatedMarker(value: unknown,): boolean {
  if (value === true || value === "true") { return true; }
  return Array.isArray(value,) && value.some((entry,) => entry === true || entry === "true");
}

const VIDEO_CONTAINER_RE = /\.(mp4|webm|mkv|mov)$/i;

/** Directory name MiniMaxH3LQPackageSave stashes packages under (stash.py:25). */
const H3_STASH_DIR = "h3_lq_stash/";
/** Latent file name inside every H3 LQ package (stash.py:26). */
const H3_LATENT_FILENAME = "latent.safetensors";

/**
 * Map a `package_path` string output into a `/view`-fetchable descriptor.
 * `MiniMaxH3LQPackageSave` returns `str(package_dir.resolve())` — an absolute
 * path to the package DIRECTORY under ComfyUI's output dir (stash.py:812).
 * Accepts the absolute form (split on the `/output/` segment) and bare
 * output-relative forms (`h3_lq_stash/...`, optionally `output/`-prefixed,
 * ending at the package dir or at `latent.safetensors`). Anything else —
 * arbitrary strings, other filenames — yields undefined.
 */
export function latentPackageDescriptor(
  raw: unknown,
): ComfyUIOutputFile | undefined {
  const value = Array.isArray(raw,) ? raw[0] : raw;
  if (typeof value !== "string") { return undefined; }
  const normalized = value.trim().replaceAll("\\", "/",);
  const withoutOutputDir = normalized.includes("/output/",)
    ? normalized.slice(normalized.lastIndexOf("/output/",) + "/output/".length,)
    : normalized.replace(/^output\//, "",);

  if (!withoutOutputDir.startsWith(H3_STASH_DIR,)) { return undefined; }
  const remainder = withoutOutputDir.slice(H3_STASH_DIR.length,);
  if (!remainder) { return undefined; }
  const subfolder = remainder.endsWith(`/${H3_LATENT_FILENAME}`,)
    ? `${H3_STASH_DIR}${remainder.slice(0, -H3_LATENT_FILENAME.length - 1,)}`
    : `${H3_STASH_DIR}${remainder}`;

  return {
    filename: H3_LATENT_FILENAME,
    subfolder,
    type: "output",
  };
}

/** Classify an `images`-bucket entry; stock SaveVideo lands there with a marker. */
function isVideoImage(file: ComfyUIOutputFile, animated: boolean,): boolean {
  if (animated) { return true; }
  if (typeof file.format === "string" && file.format.toLowerCase().startsWith("video/",)) { return true; }
  return VIDEO_CONTAINER_RE.test(file.filename,);
}

/**
 * Pick one deterministic video sink among classified refs. Preference order:
 * real container (mp4/webm/mkv/mov), then video/* MIME, then any remaining
 * video ref (animated webp and other marker-only sinks), else undefined.
 * Pure — classification and the input array are untouched.
 */
export function pickVideoSink(
  refs: readonly { kind: ComfyUIOutputKind; file: ComfyUIOutputFile }[],
): { kind: ComfyUIOutputKind; file: ComfyUIOutputFile } | undefined {
  const videos = refs.filter((ref,) => ref.kind === "video");
  const withContainer = videos.find((ref,) => VIDEO_CONTAINER_RE.test(ref.file.filename,));
  if (withContainer) { return withContainer; }

  const withMime = videos.find(
    (ref,) => typeof ref.file.format === "string" && ref.file.format.toLowerCase().startsWith("video/",),
  );

  return withMime ?? videos[0];
}

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

/** Flatten history node outputs into the kind-indexed file list pollers consume. */
function collectOutputFiles(
  outputs: Record<string, ComfyUINodeOutput> | undefined,
): { images: ComfyUIOutputFile[]; files: Array<{ kind: ComfyUIOutputKind; file: ComfyUIOutputFile }> } {
  const images: ComfyUIOutputFile[] = [];
  const files: Array<{ kind: ComfyUIOutputKind; file: ComfyUIOutputFile }> = [];
  for (const nodeOutput of Object.values(outputs ?? {},)) {
    const animated = isAnimatedMarker(nodeOutput.animated,);
    for (const file of nodeOutput.images ?? []) {
      images.push(file,);
      files.push({ kind: isVideoImage(file, animated,) ? "video" : "image", file, },);
    }

    for (const [bucket, kind,] of NON_IMAGE_BUCKETS) {
      for (const file of nodeOutput[bucket] ?? []) {
        files.push({ kind, file, },);
      }
    }

    // MiniMaxH3LQPackageSave is not an OUTPUT_NODE; when a history entry
    // carries its package_path string anyway, expose the latent file as an
    // "other" descriptor AFTER the bucket entries so bucket files keep
    // precedence (operator option (b), 2026-11-19).
    const packageFile = latentPackageDescriptor(
      (nodeOutput as { package_path?: unknown }).package_path,
    );

    if (packageFile) { files.push({ kind: "other", file: packageFile, },); }
  }

  return { images, files, };
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

  // ComfyUI /history entries carry status as an object
  // ({ status_str: "success" | "error", completed }) — normalize the
  // legacy string form unit tests use into the same comparison.
  const raw = entry.status;
  const state = typeof raw === "string" ? raw : raw.status_str;

  if (state === "completed" || state === "success") {
    return { done: true, ...collectOutputFiles(entry.outputs,), };
  }

  if (state === "failed" || state === "error" || state === "cancelled") {
    return { done: true, error: entry.error ?? `execution ${state}`, };
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
