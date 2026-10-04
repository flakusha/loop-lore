// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/call-with-failover.ts — circuit-breaker failover
//
// Extracted from registry.ts (size gate). Tries providers in order, records
// circuit-breaker outcomes, and preserves cancellation semantics.

import { CancelReason, CancelSource, } from "../../db/enums";
import { recordExecRun, } from "../../harness/exec-recorder";
import { GenerationCancelledError, } from "../cancellation-actions/error";
import { toHarnessTaskType, } from "../routing/task-signal";
import { circuitBreaker, } from "./circuit-breaker";
import type { ChunkEvent, GenerateRequest, GenerateResponse, LLMProvider, } from "./types";

/**
 * Call a provider with circuit breaker failover.
 *
 * Tries providers in order: primary → configured fallback list.
 * Skips providers whose circuit is open.
 * Records success/failure in circuit breaker.
 * Respects Retry-After headers from ProviderRateLimitError.
 *
 * When `req.harness` is set, one exec-log record is written per call — on the
 * success path and once for the final failure — so the harness log has a real
 * writer. Omitting it preserves the exact pre-harness behavior.
 * @param providers
 * @param req
 * @param handler
 * @throws {Error}
 * @throws {Error}
 * @throws {Error}
 * @returns {Promise<GenerateResponse>}
 */
export async function callWithFailover(
  providers: { name: string; provider: LLMProvider }[],
  req: GenerateRequest,
  handler?: (chunk: ChunkEvent,) => void,
): Promise<GenerateResponse> {
  const errors: string[] = [];
  const startedAt = Date.now();
  const harness = req.harness;
  const toolNames = (req.tools ?? []).map((t,) => t.function.name);

  // One log line per call, on every path. `name` is the provider that actually
  // served (or last failed) the request, not the first one tried.
  const logRun = (
    name: string,
    result: "ok" | "error" | "cancelled",
    error: string | null,
    usage?: GenerateResponse["usage"],
  ): void => {
    if (harness === undefined) { return; }
    recordExecRun({
      taskType: harness.taskType === undefined
        ? "other"
        : toHarnessTaskType(harness.taskType,),
      model: req.model,
      runMs: Date.now() - startedAt,
      result,
      usage: usage === undefined ? undefined : {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      },
      error,
      tools: toolNames,
      task: harness.task ?? name,
      pattern: harness.pattern,
      patternDetail: harness.patternDetail,
      // Null cost unless the provider publishes costPer1kTokens — never a
      // fabricated price.
      costPer1kTokens: providers.find((p,) => p.name === name)?.provider.capabilities.costPer1kTokens,
    },);
  };

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
      logRun(name, "ok", null, response.usage,);
      return response;
    } catch (error) {
      const err = error as Error & { retryable?: boolean; retryAfter?: number };
      // A cancelled generation is not a provider failure: never count it
      // against the circuit breaker and never restart the request on a
      // fallback provider — a throw during an aborted stream must
      // propagate the cancellation to the caller.
      if (req.signal?.aborted) {
        // A user cancel is a real outcome worth a log line, but it is NOT a
        // provider failure — never count it against the circuit breaker and
        // never restart the request on a fallback provider.
        logRun(name, "cancelled", err.message,);
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

  const failure = `All providers failed: ${errors.join("; ",)}`;
  // Attribute the total failure to the last provider tried, or to the model's
  // own name when the list was empty — "one log line per call, on every path"
  // has to hold on the empty-list throw too, not just the exhausted one.
  logRun(providers[providers.length - 1]?.name ?? req.model, "error", failure,);
  throw new Error(failure,);
}
