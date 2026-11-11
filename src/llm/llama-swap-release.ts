// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pre-dispatch VRAM release for the video serial gate.
 *
 * Single named seam the dispatch path calls before releasing a render:
 * enumerate → unload (parallel) → bounded drain poll → return. No-op when
 * nothing needs releasing; failure never aborts the caller.
 */
import { getChildLogger, } from "../logger";
import {
  BASE_ENV_VAR,
  baseHost,
  COMFYUI_PROXY_MODEL_ID,
  computeEvictionSet,
  DEFAULT_BASE,
  DRAIN_POLL_MS,
  DRAIN_TIMEOUT_MS,
  isLoopbackHost,
  REQUEST_TIMEOUT_MS,
  stripBase,
  unloadLlamaSwapModel,
} from "./llama-swap-unload";

const log = getChildLogger("llama-swap-release",);

/** Options for the pre-dispatch hook. `llamaSwapBase` defaults to app config, never request input. */
export interface ReleaseModelsOptions {
  llamaSwapBase?: string;
  exclude?: string[];
  apiKey?: string;
  fetchImpl?: typeof fetch;
  drainTimeoutMs?: number;
  drainPollMs?: number;
  requestTimeoutMs?: number;
}

/** What the hook released. Empty `released` = no-op (nothing warm, or nothing local to free). */
export interface ReleaseSummary {
  released: string[];
}

/**
 * Pre-dispatch hook for the video serial gate: enumerate → unload (parallel)
 * → bounded drain poll → return. No-op when nothing needs releasing; failure
 * never aborts the caller (the render proceeds; failures are warned with ids).
 * The base resolves from app config (`LLAMA_SWAP_BASE_URL`, else the loopback
 * default) — never from request input. Unauthenticated non-loopback targets
 * are refused (fail-safe skips the release, still non-fatal).
 * @param opts - optional overrides; all default for production, injected in tests
 * @returns ids actually released (empty = no-op)
 * @throws {Error} On programmer errors (explicitly blank base) only.
 */
export async function releaseModelsForRender(opts: ReleaseModelsOptions = {},): Promise<ReleaseSummary> {
  const rawBase = opts.llamaSwapBase ?? process.env[BASE_ENV_VAR] ?? DEFAULT_BASE;
  const base = stripBase(rawBase,);
  if (!base) {
    throw new Error("releaseModelsForRender: llamaSwapBase must not be blank",);
  }

  if (!opts.apiKey && !isLoopbackHost(baseHost(base,),)) {
    log?.warn("llama-swap release refused: non-loopback base without a credential", { base, },);
    return { released: [], };
  }

  const shared = {
    llamaSwapBase: base,
    apiKey: opts.apiKey,
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
  };

  const evict = await computeEvictionSet({ ...shared, exclude: opts.exclude, },);
  if (evict.length === 0) {
    return { released: [], };
  }

  // Parallel: unloads are independent and each call is one cheap admin POST;
  // per-id failures are warned inside unloadLlamaSwapModel (a throw can only
  // land in the settled record, never abort the hook).
  const settled = await Promise.allSettled(
    evict.map((id,) => unloadLlamaSwapModel({ ...shared, modelId: id, },)),
  );

  const released: string[] = [];
  for (const [index, id,] of evict.entries()) {
    const outcome = settled[index];
    if (outcome?.status === "fulfilled" && outcome.value.ok) {
      released.push(id,);
    }
  }

  await drainReleasedModels(shared, new Set(released,), opts,);
  return { released, };
}

/**
 * @param shared - base/credential/fetch seam shared with the unload POSTs
 * @param pending - ids released this pass
 * @param opts - drain deadline + interval overrides
 * @returns void once the set drains or the deadline elapses (warns, never throws)
 */
async function drainReleasedModels(
  shared: { llamaSwapBase: string; apiKey?: string; fetchImpl?: typeof fetch; timeoutMs: number },
  pending: Set<string>,
  opts: { drainTimeoutMs?: number; drainPollMs?: number },
): Promise<void> {
  const deadline = Date.now() + (opts.drainTimeoutMs ?? DRAIN_TIMEOUT_MS);
  const pollMs = opts.drainPollMs ?? DRAIN_POLL_MS;
  for (;;) {
    // computeEvictionSet never throws operationally, but [] is ambiguous
    // (drained vs unreachable) — stop polling on empty EITHER way; the render
    // must proceed and the unload POSTs already landed.
    const stillWarm = (await computeEvictionSet({ ...shared, exclude: [], },)).filter((id,) => pending.has(id,));
    if (stillWarm.length === 0 || Date.now() >= deadline) {
      if (stillWarm.length > 0) {
        log?.warn("llama-swap drain timed out", { models: stillWarm, },);
      }

      return;
    }

    const { promise, resolve, } = Promise.withResolvers<void>();
    setTimeout(resolve, pollMs,);
    await promise;
  }
}

// Re-exported so sibling-lane readers find the spare rule at the seam too.
export { COMFYUI_PROXY_MODEL_ID, };
