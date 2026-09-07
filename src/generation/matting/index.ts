// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting — public API.
 *
 * Alpha extraction (background removal) for opaque character images:
 * pluggable provider, async job lifecycle, raw + matted asset pair.
 */
export { cancelJob, getJob, listJobs, } from "./job-store";
export { createHttpMattingProvider, } from "./providers";
export { MATTING_SOURCE_LABEL, MattingService, type MattingServiceOpts, } from "./service";
export type {
  MattingError,
  MattingJob,
  MattingJobId,
  MattingJobStatus,
  MattingProvider,
  MattingProviderConfig,
  StartMattingOpts,
  StartMattingResult,
} from "./types";
