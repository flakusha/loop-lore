// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared sd.cpp job transport (BUG-sdcpp-duplication).
 *
 * One submit + poll implementation for every sd.cpp (`/sdcpp/v1`) caller:
 * the generation pipeline (`image-engine/sdcpp.ts`) and the image-edit
 * sd-server families. Timeout source: the provider's `generationTimeout`
 * config, with one shared default — the hardcoded per-site deadlines are
 * gone. Poll failures are treated as transient (a single bad poll no longer
 * aborts the job — BUG-sd-server-image-providers-abort); only a terminal
 * job status or repeated consecutive poll failures do.
 */

import { safeFetch, safeJsonStringify, } from "../../utils";

/** Default job deadline: 5 minutes. Both call sites shared this value before
 * the consolidation; `generationTimeout` config overrides it. */
export const DEFAULT_SDSERVER_JOB_TIMEOUT_MS = 300_000;

/** Poll cadence, shared by every sd.cpp caller. */
const POLL_INTERVAL_MS = 500;

/** Consecutive failed polls tolerated before the job is aborted. One bad
 * poll (503, proxy blip) must not discard a generation mid-flight. */
export const MAX_CONSECUTIVE_POLL_FAILURES = 3;

/** Terminal failure of an sd.cpp job: the error carries the HTTP-ish status
 * the caller should report (502 transport/terminal, 504 deadline). */
export class SdServerJobError extends Error {
  /** Status the caller should surface (502 or 504). */
  readonly status: number;

  constructor(message: string, status: number,) {
    super(message,);
    this.name = "SdServerJobError";
    this.status = status;
  }
}

/** Options for {@link runSdServerJob}. */
export interface SdServerJobOptions {
  /** Provider base URL, without a trailing slash. */
  baseUrl: string;
  /** sd.cpp endpoint under `/sdcpp/v1/` (e.g. `img_gen`, `txt2img`, `img2img`). */
  endpoint: string;
  /** Generation payload (JSON-serializable object or a pre-serialized JSON string). */
  body: Record<string, unknown> | string;
  /** Extra headers (auth); `Content-Type` is always set. */
  headers?: Record<string, string>;
  /** Job deadline in ms; `generationTimeout` config is the intended source. */
  generationTimeoutMs?: number;
  /** Progress sink for running updates. */
  onProgress?: (progress: number | undefined, message?: string,) => void;
}

/**
 * Submit an sd.cpp job and poll it to completion.
 * @param opts - Endpoint, payload, timeout source, and progress sink.
 * @returns {Promise<string[]>} The generated images as base64 payloads.
 * @throws {SdServerJobError} on submission failure, repeated failed polls,
 * terminal job status (`failed`/`cancelled`), completion without images, or deadline expiry.
 */
export async function runSdServerJob(opts: SdServerJobOptions,): Promise<string[]> {
  const url = `${opts.baseUrl}/sdcpp/v1/${opts.endpoint}`;

  const submitPayload = typeof opts.body === "string"
    ? { ok: true as const, value: opts.body, }
    : safeJsonStringify(opts.body,);

  // Job status carries base64 images — can exceed safeFetch's default size cap.
  const submitResult = await safeFetch<{ id: string }>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...opts.headers, },
    body: submitPayload.ok ? submitPayload.value : "{}",
    timeout: 30_000,
    maxSize: Number.MAX_SAFE_INTEGER,
    handle401: false,
  },);

  if (!submitResult.ok) {
    throw new SdServerJobError(`sd.cpp job submission failed: ${submitResult.error.message}`, 502,);
  }

  const { id: jobId, } = submitResult.data;
  if (!jobId) { throw new SdServerJobError("sd.cpp returned no job id", 502,); }

  opts.onProgress?.(0.1, "Processing...",);

  const deadline = Date.now() + (opts.generationTimeoutMs ?? DEFAULT_SDSERVER_JOB_TIMEOUT_MS);
  let consecutivePollFailures = 0;

  while (Date.now() < deadline) {
    const jobUrl = `${opts.baseUrl}/sdcpp/v1/jobs/${jobId}`;
    const statusResult = await safeFetch<{
      status: string;
      progress?: number;
      images?: string[];
      error?: string;
    }>(jobUrl, {
      timeout: 10_000,
      maxSize: Number.MAX_SAFE_INTEGER,
      handle401: false,
    },);

    if (!statusResult.ok) {
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        throw new SdServerJobError(
          `sd.cpp polling failed ${consecutivePollFailures}x in a row: ${statusResult.error.message}`,
          502,
        );
      }

      // Transient: keep polling — a mid-generation poll blip must not abort.
      await new Promise((r,) => setTimeout(r, POLL_INTERVAL_MS,));
      continue;
    }

    consecutivePollFailures = 0;
    const statusData = statusResult.data;

    if (statusData.status === "done") {
      if (!statusData.images?.length) {
        throw new SdServerJobError("sd.cpp completed but no images", 502,);
      }

      return statusData.images;
    }

    if (statusData.status === "failed" || statusData.status === "cancelled") {
      throw new SdServerJobError(
        `sd.cpp job ${statusData.status}: ${statusData.error ?? "no detail"}`,
        502,
      );
    }

    if (statusData.progress !== undefined) {
      opts.onProgress?.(statusData.progress,);
    }

    await new Promise((r,) => setTimeout(r, POLL_INTERVAL_MS,));
  }

  throw new SdServerJobError("sd.cpp job timed out", 504,);
}

/**
 * Build the auth headers a provider config + optional BYO key imply.
 * @param apiKey Resolved key (BYO pass-through or server config), if any.
 * @returns Headers to merge into the transport request.
 */
export function sdServerAuthHeaders(apiKey: string | undefined,): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}`, } : {};
}
