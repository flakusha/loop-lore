// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/call-with-failover.ts — circuit-breaker failover
//
// Extracted from registry.ts (size gate). Tries providers in order, records
// circuit-breaker outcomes, and preserves cancellation semantics.

import { CancelReason, CancelSource, } from "../../db/enums";
import { GenerationCancelledError, } from "../cancellation-actions/error";
import { circuitBreaker, } from "./circuit-breaker";
import type { ChunkEvent, GenerateRequest, GenerateResponse, LLMProvider, } from "./types";

/**
 * Call a provider with circuit breaker failover.
 *
 * Tries providers in order: primary → configured fallback list.
 * Skips providers whose circuit is open.
 * Records success/failure in circuit breaker.
 * Respects Retry-After headers from ProviderRateLimitError.
 * @param providers
 * @param req
 * @param handler
 */
export async function callWithFailover(
  providers: { name: string; provider: LLMProvider }[],
  req: GenerateRequest,
  handler?: (chunk: ChunkEvent,) => void,
): Promise<GenerateResponse> {
  const errors: string[] = [];

  for (const { name, provider: prov, } of providers) {
    if (!circuitBreaker.allowRequest(name,)) {
      const state = circuitBreaker.getState(name,);
      const remaining = state?.cooldownRemainingMs ?? 0;
      errors.push(`${name}: circuit open (${Math.ceil(remaining / 1000,)}s cooldown remaining)`,);
      continue;
    }

    try {
      const response = handler ? await prov.stream(req, handler,) : await prov.complete(req,);

      circuitBreaker.onSuccess(name,);
      return response;
    } catch (error) {
      const err = error as Error & { retryable?: boolean; retryAfter?: number };
      // A cancelled generation is not a provider failure: never count it
      // against the circuit breaker and never restart the request on a
      // fallback provider — a throw during an aborted stream must
      // propagate the cancellation to the caller.
      if (req.signal?.aborted) {
        const reason: unknown = req.signal.reason;
        if (reason instanceof GenerationCancelledError) { throw reason; }
        throw new GenerationCancelledError(CancelReason.UserCancel, CancelSource.User, err.message, {
          cause: err,
        },);
      }
      circuitBreaker.onFailure(name, err.retryAfter ? err.retryAfter * 1000 : undefined,);
      errors.push(`${name}: ${err.message}`,);
    }
  }

  throw new Error(`All providers failed: ${errors.join("; ",)}`,);
}
