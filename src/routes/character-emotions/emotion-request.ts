// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared request validation for the emotion-avatar write endpoints.
 *
 * The `emotions` cap / validity / duplicate rules are identical for batch
 * generation and actor-level regeneration, so the checks live here once. Each
 * caller invokes this at the exact point the inline block used to sit, so the
 * authorization → validation → service-call ordering is untouched.
 */
import { EmotionType, } from "../../db/enums";
import { HttpStatus, jsonError, } from "../http-utils";

/**
 * Validate an optional `emotions` array.
 *
 * Returns the first failing 400 Response, or `null` when the array is absent,
 * empty, or fully valid.
 * @param emotionsParam - Raw `emotions` array from the request body
 * @returns The 400 Response to short-circuit the handler, or `null` when valid
 */
export function validateEmotionsParam(emotionsParam: string[] | undefined,): Response | null {
  if (!emotionsParam || emotionsParam.length === 0) { return null; }

  const validEmotions = Object.values(EmotionType,) as string[];
  // BUG-emotion-avatar-emotions-array-uncapped-x-default-rate-policy:
  // every entry fans out into its own image-gen job, so the array is
  // capped at one entry per emotion and duplicates are rejected —
  // uncapped, a single request could enqueue unbounded generation work.
  if (emotionsParam.length > validEmotions.length) {
    return jsonError({
      message: `emotions accepts at most ${validEmotions.length} entries`,
      status: HttpStatus.BadRequest,
    },);
  }

  for (const e of emotionsParam) {
    if (!validEmotions.includes(e,)) {
      return jsonError({ message: `Invalid emotion: ${e}`, status: HttpStatus.BadRequest, },);
    }
  }

  const seenEmotions = new Set(emotionsParam,);
  if (seenEmotions.size !== emotionsParam.length) {
    return jsonError({ message: "emotions must not contain duplicates", status: HttpStatus.BadRequest, },);
  }

  return null;
}
