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
import { safeFetch, } from "../utils/safe-fetch";

// ── Env configuration ───────────────────────────────────────────────────────

/**
 * Single source of truth for the embedding model.
 * OLLAMA_EMBED_MODEL overrides; default "nomic-embed-text".
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
 * Embed via an OpenAI-compatible POST /v1/embeddings endpoint (llama.cpp
 * server / llama-swap expose no Ollama /api/embed route).
 * @param text
 * @param model
 * @param baseUrl
 * @throws On transport failure, non-OK status, or an empty response.
 */
async function embedViaOpenAI(text: string, model: string, baseUrl: string,): Promise<number[]> {
  const result = await safeFetch<{ data?: { embedding?: number[] }[] }>(
    `${baseUrl}/v1/embeddings`,
    { method: "POST", body: { model, input: text, }, timeout: 30_000, },
  );
  if (!result.ok) {
    throw new Error(`OpenAI embeddings request failed: ${result.error.message}`,);
  }
  const emb = result.data.data?.[0]?.embedding;
  if (!emb) { throw new Error("Embedding provider returned no embeddings.",); }
  return emb;
}

/**
 * Embed a single text string via the configured embedding transport
 * (EMBEDDINGS_API: "ollama" default | "openai" for llama.cpp / llama-swap).
 * @param text
 * @throws If the embedding call fails or returns no results.
 */
export async function embedText(text: string,): Promise<Float32Array> {
  const model = resolveEmbedModel();
  let emb: number[] | undefined;
  if (process.env.EMBEDDINGS_API === "openai") {
    emb = await embedViaOpenAI(text, model, resolveEmbeddingsBaseUrl(),);
  } else {
    emb = (await embedDispatch(buildOllamaState(), text, model,))[0];
  }
  if (!emb) { throw new Error("Embedding provider returned no embeddings.",); }
  // Normalise to unit length so cosine similarity = dot product.
  return normalise(new Float32Array(emb,),);
}
