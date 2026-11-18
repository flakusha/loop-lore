// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory Embeddings — provider transport.
 *
 * Env configuration, the Ollama-native and OpenAI-compatible transports
 * (llama-server exposes /v1/embeddings but no Ollama /api/embed), and the
 * small vector math shared with the storage/recall layer.
 *
 * Env knobs (read at call time so tests can set them):
 *   OLLAMA_EMBED_MODEL   embedding model id (default "nomic-embed-text")
 *   EMBEDDINGS_API       "ollama" (default) | "openai"
 *   EMBEDDINGS_BASE_URL  EMBEDDINGS_BASE_URL -> OLLAMA_BASE_URL -> localhost:11434
 */
import { embedDispatch, } from "../generation/providers/ollama-native/operations";
import type { OllamaNativeState, } from "../generation/providers/ollama-native/types";
import { BACKGROUND, toHarnessTaskType, } from "../generation/routing/task-signal";
import { recordExecRun, } from "../harness/exec-recorder";
import { safeFetch, } from "../utils/safe-fetch";

// ── Env configuration ───────────────────────────────────────────────────────

/**
 * Single source of truth for the embedding model.
 * OLLAMA_EMBED_MODEL overrides; default "nomic-embed-text".
 * @returns {string}
 */
export function resolveEmbedModel(): string {
  return process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
}

/**
 * Build the Ollama native state from environment / defaults.
 *
 * Matches the pattern used in tests and avoids a hard dependency on the
 * provider registry at import time.  Override via OLLAMA_BASE_URL env var.
 */
function buildOllamaState(): OllamaNativeState {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    apiKey: undefined,
    defaultModel: resolveEmbedModel(),
    timeout: 30_000,
    retries: 1,
    headers: {},
  };
}

/**
 * Embeddings base URL: EMBEDDINGS_BASE_URL → OLLAMA_BASE_URL → localhost.
 */
function resolveEmbeddingsBaseUrl(): string {
  return process.env.EMBEDDINGS_BASE_URL ?? process.env.OLLAMA_BASE_URL ??
    "http://localhost:11434";
}

// ── Vector math ─────────────────────────────────────────────────────────────

/**
 * L2 norm of a vector.
 * @param vec
 */
function l2Norm(vec: Float32Array,): number {
  let s = 0;
  for (let i = 0; i < vec.length; i++) { s += (vec[i] ?? 0) * (vec[i] ?? 0); }
  return Math.sqrt(s,);
}

/**
 * @param a
 * @param b
 * @returns {number}
 */
export function dot(a: Float32Array, b: Float32Array,): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) { s += (a[i] ?? 0) * (b[i] ?? 0); }
  return s;
}

/**
 * @param vec
 */
function normalise(vec: Float32Array,): Float32Array {
  const norm = l2Norm(vec,);
  if (norm === 0) { return vec; }
  for (let i = 0; i < vec.length; i++) { vec[i] = (vec[i] ?? 0) / norm; }
  return vec;
}

// ── Embedding ─────────────────────────────────────────────────────────────

/**
 * True for a loopback base URL — a local llama.cpp / llama-swap server.
 * @param base
 * @returns {boolean}
 */
function isLoopback(base: string,): boolean {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(base,);
}

/**
 * Bearer key for the OpenAI-compatible embeddings transport.
 *
 * E2E_EMBEDDINGS_KEY is the surface-specific key and is always used.
 * BYOK_E2E_API_KEY is the shared OpenRouter key: it is only sent to a remote
 * endpoint, never to a loopback one, so a local llama.cpp server keeps
 * working unauthenticated exactly as before.
 * @param base
 * @returns {string | undefined}
 */
function resolveEmbeddingsApiKey(base: string,): string | undefined {
  const explicit = process.env.E2E_EMBEDDINGS_KEY?.trim();
  if (explicit) { return explicit; }
  const shared = process.env.BYOK_E2E_API_KEY?.trim();
  if (!shared) { return undefined; }
  return isLoopback(base,) ? undefined : shared;
}

/**
 * Input role for asymmetric embedding models (NVIDIA Nemotron wants
 * "query" | "passage"). EMBEDDINGS_INPUT_TYPE; unset → not sent.
 * @throws When set to a value other than "query" or "passage".
 * @returns {"query" | "passage" | undefined}
 */
function resolveEmbeddingsInputType(): "query" | "passage" | undefined {
  const value = process.env.EMBEDDINGS_INPUT_TYPE?.trim();
  if (value === undefined || value === "") { return undefined; }
  if (value !== "query" && value !== "passage") {
    throw new Error(`EMBEDDINGS_INPUT_TYPE must be "query" or "passage" (got "${value}").`,);
  }

  return value;
}

/**
 * Embed via an OpenAI-compatible POST /v1/embeddings endpoint (llama.cpp
 * server / llama-swap expose no Ollama /api/embed route; OpenRouter serves
 * the same shape under /api/v1).
 * @param text
 * @param model
 * @param baseUrl
 * @param opts
 * @param opts.inputType  Role hint for asymmetric embedding models.
 * @throws On transport failure, non-OK status, or an empty response.
 */
async function embedViaOpenAI(
  text: string,
  model: string,
  baseUrl: string,
  opts: { inputType?: "query" | "passage" } = {},
): Promise<number[]> {
  const base = baseUrl.replace(/\/+$/, "",);
  // OpenRouter's base already ends in /v1; llama.cpp's does not.
  const url = base.endsWith("/v1",) ? `${base}/embeddings` : `${base}/v1/embeddings`;
  const apiKey = resolveEmbeddingsApiKey(base,);
  const inputType = opts.inputType ?? resolveEmbeddingsInputType();
  const body: Record<string, unknown> = { model, input: text, };
  if (inputType !== undefined) {
    // NVIDIA's NIM API requires `input_type` ("query" | "passage"). It is sent
    // twice on purpose: as the documented top-level field and as a provider
    // option (OpenRouter forwards provider options to the matched provider).
    const slug = model.includes("/",) ? model.split("/",)[0]! : "nvidia";
    body.input_type = inputType;
    body.provider = { options: { [slug]: { input_type: inputType, }, }, };
  }

  const result = await safeFetch<{ data?: { embedding?: number[] }[] }>(
    url,
    {
      method: "POST",
      body,
      headers: apiKey === undefined ? undefined : { Authorization: `Bearer ${apiKey}`, },
      timeout: 30_000,
    },
  );

  if (!result.ok) {
    throw new Error(`OpenAI embeddings request failed: ${result.error.message}`,);
  }

  const emb = result.data.data?.[0]?.embedding;
  if (!emb) { throw new Error("Embedding provider returned no embeddings.",); }
  return emb;
}

/** Options for embedText. */
export interface EmbedTextOptions {
  /**
   * Input role for asymmetric embedding models (NVIDIA Nemotron): "query" for
   * a search query, "passage" for a stored document. Falls back to
   * EMBEDDINGS_INPUT_TYPE.
   */
  inputType?: "query" | "passage";
}

/**
 * Embed a single text string via the configured embedding transport
 * (EMBEDDINGS_API: "ollama" default | "openai" for llama.cpp / llama-swap).
 * @param text
 * @param opts
 * @throws If the embedding call fails or returns no results.
 * @returns {Promise<Float32Array<ArrayBufferLike>>}
 */
export async function embedText(text: string, opts: EmbedTextOptions = {},): Promise<Float32Array> {
  const model = resolveEmbedModel();
  // Exec log: embeddings is a background transport (raw HTTP or a provider
  // dispatch, neither of which passes through callWithFailover), so it records
  // here. No cost metadata on either transport, so cost stays null (unknown)
  // rather than being invented.
  const startedAt = Date.now();
  try {
    let emb: number[] | undefined;
    if (process.env.EMBEDDINGS_API === "openai") {
      emb = await embedViaOpenAI(text, model, resolveEmbeddingsBaseUrl(), {
        inputType: opts.inputType,
      },);
    } else {
      emb = (await embedDispatch(buildOllamaState(), text, model,))[0];
    }

    if (!emb) { throw new Error("Embedding provider returned no embeddings.",); }
    recordExecRun({
      taskType: toHarnessTaskType(BACKGROUND.taskType,),
      model,
      runMs: Date.now() - startedAt,
      result: "ok",
      task: "memory:embeddings",
    },);

    // Normalise to unit length so cosine similarity = dot product.
    return normalise(new Float32Array(emb,),);
  } catch (error) {
    recordExecRun({
      taskType: toHarnessTaskType(BACKGROUND.taskType,),
      model,
      runMs: Date.now() - startedAt,
      result: "error",
      error: (error as Error).message,
      task: "memory:embeddings",
    },);

    throw error;
  }
}
