// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared profanity policy for message write boundaries.
 *
 * Pure by design: each caller reads `profanity_filter` from system_config and
 * passes the flag in, so the same verdict governs user text and generated
 * assistant text without a DB dependency here.
 */
import { containsProfanity, filter, } from "./service";

/** Outcome of applying the configured policy to one stored-text write. */
export interface ProfanityWritePolicyResult {
  /** Text to persist/render under the current policy. */
  text: string;
  /** Whether the RAW text tripped the detector (visibility moderation only). */
  hasProfanity: boolean;
}

/**
 * Apply the configured profanity policy to a write boundary.
 * @param enabled - Whether `profanity_filter` is configured on.
 * @param text - Raw text about to be stored.
 * @returns The text to store and the raw-text profanity verdict.
 */
export function applyProfanityWritePolicy(
  enabled: boolean,
  text: string,
): ProfanityWritePolicyResult {
  const hasProfanity = containsProfanity(text,);
  return { text: enabled ? filter(text,) : text, hasProfanity, };
}
