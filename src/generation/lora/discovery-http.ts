// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LoRA Discovery HTTP helpers
 *
 * Shared fetch/error plumbing for backend discovery functions
 * (ComfyUI, sd.cpp). Both backends perform the same abort-with-timeout
 * fetch and normalize thrown errors into a `LoRADiscoveryResult`, so that
 * machinery lives here instead of being duplicated per backend.
 *
 * @module generation/lora/discovery-http
 */

import type { LoRADiscoveryResult, } from "./types";

/**
 * Context describing a discovery attempt, used to label error results.
 */
export interface DiscoveryFailureContext {
  /** Backend tag stamped onto the returned result. */
  backend: "comfyui" | "sd-server";
  /** Human label for the backend (used in error messages). */
  label: string;
  /** Base URL that was queried (used in "not reachable" errors). */
  baseUrl: string;
  /** Timeout in ms (used in "timed out" errors). */
  timeoutMs: number;
  /** Timestamp captured at discovery start. */
  timestamp: number;
}

/**
 * Fetch a URL with an abort-based timeout.
 *
 * Throws on timeout (AbortError) or network failure; callers catch and route
 * the error through {@link discoveryErrorResult}. The timer is always cleared
 * once the request settles, even on throw.
 *
 * @param url - URL to fetch
 * @param timeoutMs - Timeout in ms before the request is aborted
 * @returns The resolved {@link Response}
 * @throws {DOMException} AbortError on timeout, plus any underlying fetch error
 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs,);

  try {
    return await fetch(url, {
      headers: { "Content-Type": "application/json", },
      signal: controller.signal,
    },);
  } finally {
    clearTimeout(timeout,);
  }
}

/**
 * Normalize a thrown discovery error into a `LoRADiscoveryResult` with no
 * models and a classified `error` message (timeout / unreachable / generic).
 *
 * @param error - The thrown value from the fetch or parsing path
 * @param ctx - Discovery attempt context used to label the result
 * @returns An empty `LoRADiscoveryResult` carrying the classified error
 */
export function discoveryErrorResult(
  error: unknown,
  ctx: DiscoveryFailureContext,
): LoRADiscoveryResult {
  const message = error instanceof Error ? error.message : String(error,);

  // Handle abort (timeout)
  if (message.includes("abort",) || message.includes("AbortError",)) {
    return {
      models: [],
      backend: ctx.backend,
      timestamp: ctx.timestamp,
      error: `${ctx.label} discovery timed out after ${ctx.timeoutMs}ms`,
    };
  }

  // Handle connection errors
  if (message.includes("ECONNREFUSED",) || message.includes("fetch failed",)) {
    return {
      models: [],
      backend: ctx.backend,
      timestamp: ctx.timestamp,
      error: `${ctx.label} server not reachable at ${ctx.baseUrl}`,
    };
  }

  return {
    models: [],
    backend: ctx.backend,
    timestamp: ctx.timestamp,
    error: `${ctx.label} discovery error: ${message}`,
  };
}
