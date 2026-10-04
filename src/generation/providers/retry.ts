// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/retry.ts — shared provider retry policy
//
// Replaces the byte-identical hand-rolled backoff loops that were copy-pasted
// into anthropic/http.ts, ollama-native/http.ts and openai-compatible/http.ts.
// The delay schedule (1s, 2s, 4s … capped at 10s) and the retryability rule
// (a ProviderError with retryable=false stops immediately; every other
// transport failure is retried) are now stated once, via Effect's Schedule.

import { Duration, Effect, Schedule, } from "effect";
import { ProviderError, } from "./types";

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 10_000;

/**
 * Map a raw transport failure onto the error the retry policy should see.
 *
 * Precedence matters and is preserved from the hand-rolled loops these three
 * call sites used to carry: a non-retryable ProviderError is surfaced
 * untouched (a 401 raised while the user cancelled is still an auth failure,
 * and callers map auth errors differently from cancellations), then a
 * cancelled signal, then a fetch-level AbortError. Everything else passes
 * through and is retried.
 * @param cause - Raw failure from the request thunk
 * @param signal - Caller abort signal, when the request has one
 */
function classifyFailure(cause: unknown, signal?: AbortSignal,): unknown {
  if (cause instanceof ProviderError && !cause.retryable) { return cause; }
  if (signal?.aborted) { return new ProviderError("Request cancelled", undefined, undefined, false,); }
  if (cause instanceof Error && cause.name === "AbortError") {
    return new ProviderError("Request timed out", undefined, 504, false,);
  }

  return cause;
}

/**
 * Run a provider request, retrying retryable failures with capped exponential backoff.
 * @param run - Request thunk; must throw on failure
 * @param retries - Retry attempts after the first (0 means a single attempt)
 * @param signal - Caller abort signal, used to classify cancellations
 * @returns The thunk's resolved value
 * @throws The last failure after `retries` attempts, or the first non-retryable failure
 */
export async function withProviderRetry<A,>(
  run: () => Promise<A>,
  retries: number,
  signal?: AbortSignal,
): Promise<A> {
  const backoff = Schedule.exponential(`${BASE_DELAY_MS} millis`,).pipe(
    Schedule.modifyDelay(({ duration, },) => Effect.succeed(Duration.min(duration, Duration.millis(MAX_DELAY_MS,),),)),
  );

  return await Effect.runPromise(
    Effect.retry(Effect.tryPromise({ try: run, catch: (cause: unknown,) => classifyFailure(cause, signal,), },), {
      schedule: backoff,
      times: Math.max(0, retries,),
      while: (error: unknown,) => !(error instanceof ProviderError) || error.retryable,
    },),
  );
}
