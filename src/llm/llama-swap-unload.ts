// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Precise per-model llama-swap unload for video pre-dispatch.
 *
 * Frees VRAM before a render WITHOUT evicting the ComfyUI proxy entry.
 * Reference: `docs/spec/integrations/llm-serving.md` § Pre-dispatch per-model unload.
 *
 * NEVER-call list (each stops `comfyui_auto` too, killing the diffusion half):
 * - `GET {base}/unload` — unloads ALL running local processes.
 * - `POST {base}/api/models/unload` — the same blunt instrument, JSON flavour.
 * - `POST {base}/api/models/pause` — unloads all AND rejects every local
 *   endpoint (`/v1/...`, `/upstream/...`, `/comfyui/...`) with `503 all
 *   inference is paused` until resume. Maintenance mode, never a release.
 *
 * Race note for the LLM caller: an evicted model's waiters and queued
 * requests fail with `"<router>: model unloaded"`; do NOT retry the LLM call
 * before the render completes (the render path is unaffected).
 *
 * Auth: pass the instance credential via `apiKey` (Bearer) when the
 * deployment requires one. Unauthenticated use targets a loopback-bound
 * instance ONLY — the hook refuses a non-loopback base without a key, and
 * that loopback binding is a documented deployment requirement.
 */

import { getChildLogger, } from "../logger";

const log = getChildLogger("llama-swap-unload",);

/** Model id of the upstream `/comfyui` passthrough — never evicted, by construction. */
export const COMFYUI_PROXY_MODEL_ID = "comfyui_auto";

/** Drain deadline: fixed constant covering the max recommended per-model `unloadTimeout` (30s) plus margin. */
export const DRAIN_TIMEOUT_MS = 30_000;
/** Interval between drain polls. */
export const DRAIN_POLL_MS = 250;
/** Per-request timeout for the small admin calls. */
export const REQUEST_TIMEOUT_MS = 10_000;
/** Default base: llama-swap's default `startPort`, loopback-bound by the app's own spawn. */
export const DEFAULT_BASE = "http://127.0.0.1:8080";
/** Env override for the operator's llama-swap base (app config, never request input). */
export const BASE_ENV_VAR = "LLAMA_SWAP_BASE_URL";

/** Options for unloading ONE model. The id is a single string — no array, no empty-means-all. */
export interface UnloadModelOptions {
  llamaSwapBase: string;
  modelId: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Outcome of one unload call. Both 404 shapes collapse into `alreadyGone`. */
export type UnloadOutcome =
  | { ok: true; alreadyGone: boolean }
  | { ok: false; status?: number; error: string };

/**
 * @param base - llama-swap base URL
 * @returns the base without trailing slashes
 */
export function stripBase(base: string,): string {
  let end = base.length;
  while (end > 0 && base[end - 1] === "/") {
    end -= 1;
  }

  return base.slice(0, end,);
}

/**
 * @param base - llama-swap base URL
 * @returns the lowercased hostname, or undefined when the base does not parse
 */
export function baseHost(base: string,): string | undefined {
  try {
    return new URL(base,).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * @param host - lowercased hostname from baseHost
 * @returns true for loopback hosts only; false and undefined fail safe
 */
export function isLoopbackHost(host: string | undefined,): boolean {
  // Note: `new URL("http://[::1]:…").hostname` keeps the brackets.
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" ||
    (host?.startsWith("127.",) ?? false);
}

/**
 * @param apiKey - instance credential, if the deployment requires one
 * @returns Bearer auth headers, or {} for unauthenticated loopback use
 */
export function authHeaders(apiKey?: string,): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${apiKey}`, } : {};
}

/**
 * @param resp - unload POST response
 * @param modelId - unloaded model, for the warn log
 * @returns classified outcome; both 404 shapes are continue-cases
 */
async function classifyUnloadResponse(resp: Response, modelId: string,): Promise<UnloadOutcome> {
  if (resp.ok) {
    return { ok: true, alreadyGone: false, };
  }

  let body = "";
  try {
    body = await resp.text();
  } catch {
    body = "";
  }

  if (resp.status === 404) {
    const text = body.toLowerCase();
    // Unknown/already-gone, or peer-served (nothing local to free): continue.
    if (text.includes("model not found",) || text.includes("no local server found",)) {
      return { ok: true, alreadyGone: true, };
    }
  }

  log?.warn("llama-swap unload failed", { model: modelId, status: resp.status, },);
  return { ok: false, status: resp.status, error: body.slice(0, 200,), };
}

/**
 * Unload ONE named local model: `POST {base}/api/models/unload/{modelId}`.
 * The signature takes a single id, so "unload everything" is inexpressible.
 * @param opts - base, single model id, optional credential/fetch seam
 * @returns ok, or ok:false for operational failures (warned, never thrown)
 * @throws {Error} On programmer errors (blank base or model id) only.
 */
export async function unloadLlamaSwapModel(opts: UnloadModelOptions,): Promise<UnloadOutcome> {
  const base = stripBase(opts.llamaSwapBase,);
  if (!base) { throw new Error("unloadLlamaSwapModel: llamaSwapBase must not be blank",); }
  if (!opts.modelId) { throw new Error("unloadLlamaSwapModel: modelId must not be blank",); }
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${base}/api/models/unload/${encodeURIComponent(opts.modelId,)}`;
  let resp: Response;
  try {
    resp = await doFetch(url, {
      method: "POST",
      headers: authHeaders(opts.apiKey,),
      signal: AbortSignal.timeout(opts.timeoutMs ?? REQUEST_TIMEOUT_MS,),
    },);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    log?.warn("llama-swap unload unreachable", { model: opts.modelId, error: message, },);
    return { ok: false, error: message, };
  }

  return classifyUnloadResponse(resp, opts.modelId,);
}

/** One `/running` entry — only `model` is read; `proxy`/`cmd` are ignored by design (see Q1). */
interface RunningEntry {
  model?: unknown;
}

/**
 * Fetch the warm set from a FRESH `GET {base}/running` — stateless, never cached across awaits.
 * @param opts - base, extra spares beyond `comfyui_auto`, optional credential/fetch seam
 * @returns eviction set: running ids minus `comfyui_auto` (and `exclude`); [] on any fetch failure
 * @throws {Error} On programmer errors (blank base) only.
 */
export async function computeEvictionSet(
  opts: { llamaSwapBase: string; exclude?: string[]; apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<string[]> {
  const base = stripBase(opts.llamaSwapBase,);
  if (!base) {
    throw new Error("computeEvictionSet: llamaSwapBase must not be blank",);
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const extra = new Set(opts.exclude ?? [],);
  let data: { running?: unknown };
  try {
    const resp = await doFetch(`${base}/running`, {
      headers: authHeaders(opts.apiKey,),
      signal: AbortSignal.timeout(opts.timeoutMs ?? REQUEST_TIMEOUT_MS,),
    },);

    if (!resp.ok) {
      log?.warn("llama-swap /running failed", { status: resp.status, },);
      return [];
    }

    data = (await resp.json()) as { running?: unknown };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    log?.warn("llama-swap /running unreachable", { error: message, },);
    return [];
  }

  if (typeof data !== "object" || data === null || !Array.isArray(data.running,)) {
    log?.warn("llama-swap /running malformed", {},);
    return [];
  }

  const ids: string[] = [];
  for (const entry of data.running as RunningEntry[]) {
    const id = typeof entry === "object" && entry !== null ? entry.model : undefined;
    if (typeof id !== "string" || id === "" || id === COMFYUI_PROXY_MODEL_ID || extra.has(id,)) { continue; }
    ids.push(id,);
  }

  return ids;
}
