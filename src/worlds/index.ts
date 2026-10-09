// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/index.ts — worlds module barrel
 *
 * Temporal + social layers over the world foundation: the epoch +
 * time-scale engine lives in `timescale.ts` (shareability, maps and
 * location assets land here as later epic tasks).
 */
export {
  createTimescaleService,
  DEFAULT_EPOCH,
  DEFAULT_SCALE_SIZE,
  MAX_EPOCH_LENGTH,
  TimescaleError,
} from "./timescale";
export type {
  AdvanceResult,
  EpochSummary,
  TimescaleClock,
  TimescaleOptions,
  TimescalePatch,
  TimescaleRow,
  TimescaleService,
  WorldTime,
} from "./timescale";
