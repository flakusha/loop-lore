// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Seed discipline for emotion-avatar generation.
 *
 * One batch runs under ONE base seed; every emotion slot derives its provider
 * seed from it as `base + EMOTION_ORDINAL[emotion]` — a stable per-emotion
 * offset, so re-running a batch with the same base reproduces the same slot
 * seeds and re-running a single slot reproduces that slot alone.
 *
 * Reproducibility is provider-dependent: the `sdcpp` and `comfyui` families
 * forward the seed to the backend; `openai` and `sdapi` ignore it and let the
 * provider choose the noise.
 */

import { randomInt, } from "node:crypto";
import { EMOTION_ORDINAL, } from "../../../db/enums";
import type { EmotionType, } from "../../../db/enums";

/** Largest per-emotion ordinal; a slot seed is `base + ordinal`. */
const MAX_EMOTION_ORDINAL = Math.max(...Object.values(EMOTION_ORDINAL,),);

/**
 * Upper bound for a base seed. The margin keeps `base + ordinal` inside the
 * signed 32-bit range the image providers expect.
 */
export const MAX_BASE_SEED = 2_147_483_647 - MAX_EMOTION_ORDINAL;

/** Error message for a caller-supplied seed outside the valid range. */
export const INVALID_SEED_MESSAGE = `seed must be an integer between 0 and ${MAX_BASE_SEED}`;

/**
 * Random base seed for a batch with neither an explicit nor a recorded seed.
 * @returns A non-negative seed.
 */
export function randomBaseSeed(): number {
  return randomInt(0, MAX_BASE_SEED,);
}

/**
 * Whether a caller-supplied value can be used as a base seed.
 * @param value - The raw seed from the request.
 * @returns True when the value is a non-negative integer inside the seed range.
 */
export function isValidSeed(value: unknown,): value is number {
  return typeof value === "number" && Number.isInteger(value,) && value >= 0 && value <= MAX_BASE_SEED;
}

/**
 * Provider seed for one emotion slot under a batch base seed.
 * @param base - The batch base seed.
 * @param emotion - The emotion slot being generated.
 * @returns The slot seed sent to the image provider.
 */
export function slotSeed(base: number, emotion: EmotionType,): number {
  return base + EMOTION_ORDINAL[emotion];
}
