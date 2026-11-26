// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pre-dispatch VRAM release for the video serial gate.
 *
 * Single named seam the dispatch path calls before releasing a render:
 * enumerate → unload (parallel) → bounded drain poll → return. No-op when
 * nothing needs releasing; failure never aborts the caller.
 */
import { type HonkboxProbeResult, isHonkboxFeatureEnabled, } from "../integrations/honkbox/capabilities";
import { honkboxImageBaseUrl, } from "../integrations/honkbox/provider-config";
import { getChildLogger, } from "../logger";
import {
  baseHost,
  COMFYUI_PROXY_MODEL_ID,
  DRAIN_POLL_MS,
  DRAIN_TIMEOUT_MS,
  isLoopbackHost,
  readRunningModels,
  REQUEST_TIMEOUT_MS,
  resolveLlamaSwapBase,
  stripBase,
  unloadLlamaSwapModel,
} from "./llama-swap-unload";

const log = getChildLogger("llama-swap-release",);

/** Options for the pre-dispatch hook. Base defaults to app config, never request input. */
export interface ReleaseModelsOptions {
  /** Explicit proxy base — highest precedence. */
  llamaSwapBase?: string;
  /** Spawned-proxy listen port (the D1 `listenPort` knob start-llama spawns with). */
  listenPort?: number;
  exclude?: string[];
  apiKey?: string;
  fetchImpl?: typeof fetch;
  drainTimeoutMs?: number;
  drainPollMs?: number;
  requestTimeoutMs?: number;
  /** Optional honkbox backend; used only when its probe advertises `residency_control`. */
  honkbox?: { baseUrl: string; apiKey?: string; probe?: HonkboxProbeResult };
}

/**
 * Choose the residency backend. honkbox is used only when configured and its
 * probe advertises `residency_control`; otherwise the llama-swap path stands.
 * @param opts - hook options
 * @returns stripped base, credential and which backend was selected
 * @throws {Error} When the selected base is blank (programmer error).
 */
function resolveReleaseTarget(
  opts: ReleaseModelsOptions,
): { base: string; apiKey?: string; useHonkbox: boolean } {
  const honkbox = opts.honkbox;
  const useHonkbox = honkbox !== undefined &&
    isHonkboxFeatureEnabled(honkbox.probe, "residency_control",);

  // honkboxImageBaseUrl drops `/v1`: its admin endpoints live at the origin.
  const rawBase = useHonkbox && honkbox
    ? honkboxImageBaseUrl(honkbox.baseUrl,)
    : resolveLlamaSwapBase({ llamaSwapBase: opts.llamaSwapBase, listenPort: opts.listenPort, },);

  const base = stripBase(rawBase,);
  if (!base) {
    throw new Error(
      useHonkbox
        ? "releaseModelsForRender: honkbox.baseUrl must not be blank"
        : "releaseModelsForRender: llamaSwapBase must not be blank",
    );
  }

  return { base, apiKey: useHonkbox ? honkbox?.apiKey : opts.apiKey, useHonkbox, };
}

/** What the hook released. `probeOk:false` = the proxy never answered (nothing was freed); `released` is empty either way. */
export interface ReleaseSummary {
  released: string[];
  probeOk: boolean;
}

/**
 * Pre-dispatch hook for the video serial gate: enumerate → unload (parallel)
 * → bounded drain poll → return. No-op when nothing needs releasing; failure
 * never aborts the caller (the render proceeds; failures are warned with ids).
 * The base resolves from app config (explicit `llamaSwapBase`, else
 * `LLAMA_SWAP_BASE_URL` env, else loopback at `listenPort`) — never from
 * request input. Unauthenticated non-loopback targets are refused (fail-safe
 * skips the release, still non-fatal). A dead probe is reported LOUD via
 * `probeOk:false` (and a warn) — never misread as "drained".
 * @param opts - optional overrides; all default for production, injected in tests
 * @returns ids actually released (empty = no-op or probe failure; check `probeOk`)
 * @throws {Error} On probe failure when `throwOnProbeFailure` is set, or programmer errors.
 */
export async function releaseModelsForRender(
  opts: ReleaseModelsOptions & { throwOnProbeFailure?: boolean } = {},
): Promise<ReleaseSummary> {
  const { base, apiKey, } = resolveReleaseTarget(opts,);

  if (!apiKey && !isLoopbackHost(baseHost(base,),)) {
    log?.warn("release refused: non-loopback base without a credential", { base, },);
    return { released: [], probeOk: false, };
  }

  const shared = {
    llamaSwapBase: base,
    apiKey,
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
  };

  const probe = await readRunningModels({ ...shared, exclude: opts.exclude, },);
  if (!probe.ok) {
    const message = `release probe failed before render (${probe.error ?? "unknown"}) — VRAM NOT released`;
    log?.warn(message, { base, },);
    if (opts.throwOnProbeFailure) { throw new Error(message,); }
    return { released: [], probeOk: false, };
  }

  const evict = probe.ids;
  if (evict.length === 0) {
    return { released: [], probeOk: true, };
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
  return { released, probeOk: true, };
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
    // readRunningModels never throws operationally; ok:false is a failed
    // poll, not a drained set — stop polling and report loud (the unload
    // POSTs already landed, the render still proceeds).
    const poll = await readRunningModels({ ...shared, exclude: [], },);
    if (!poll.ok) {
      log?.warn("residency drain probe failed — pool state unknown", { error: poll.error, },);
      return;
    }

    const stillWarm = poll.ids.filter((id,) => pending.has(id,));
    if (stillWarm.length === 0 || Date.now() >= deadline) {
      if (stillWarm.length > 0) {
        log?.warn("residency drain timed out", { models: stillWarm, },);
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
