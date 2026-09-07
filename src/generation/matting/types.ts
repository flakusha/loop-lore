// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting — public types.
 *
 * Background-removal (alpha extraction) for opaque character images.
 * Produces a matted RGBA derivative asset linked to the raw asset via
 * `asset_links` (`entity_type: "asset"`), so matting is re-runnable with a
 * better model without re-rolling the generation.
 */
import type { AssetAlphaStatus, } from "../../db/enums";

/** Branded type for matting job IDs */
export type MattingJobId = string & { readonly __brand: "MattingJobId" };

/** Endpoint configuration for a pluggable background-removal model. */
export interface MattingProviderConfig {
  /** Stable provider name recorded on jobs (e.g. "rembg-local", "ark-bgremoval"). */
  name: string;
  /** HTTP endpoint accepting the source image and returning PNG bytes. */
  endpoint: string;
  /** Optional bearer token / API key. */
  apiKey?: string;
  /** Optional request timeout in milliseconds (default 120_000). */
  timeoutMs?: number;
}

/** A pluggable background-removal model invocation. */
export interface MattingProvider {
  readonly name: string;
  /**
   * Remove the background from an image buffer.
   * @param buffer source image bytes (opaque)
   * @returns RGBA PNG bytes of the cut-out
   */
  removeBackground(buffer: Buffer,): Promise<Buffer>;
}

/** Status of a matting job. */
export type MattingJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/** Async matting job record (in-memory, mirrors emotion-avatar batch jobs). */
export interface MattingJob {
  id: MattingJobId;
  /** Raw (source) asset ID. */
  assetId: string;
  ownerId: string;
  providerName: string;
  status: MattingJobStatus;
  /** Asset alpha status before the job transitioned it to matting_pending. */
  previousStatus: AssetAlphaStatus;
  mattedAssetId?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

/** Options for enqueuing a matting job. */
export interface StartMattingOpts {
  /** Raw (source) asset ID. */
  assetId: string;
  /** Owner used both for ownership checks and as the derivative's owner. */
  ownerId: string;
}

/** Result of enqueueing a matting job. */
export type StartMattingResult =
  | { ok: true; jobId: MattingJobId; /** Resolves when the job reaches a terminal state. */ done: Promise<void> }
  | { ok: false; error: MattingError };

/** Typed failure reasons for enqueueing. */
export type MattingError =
  | "asset_not_found"
  | "not_eligible"
  | "forbidden";
