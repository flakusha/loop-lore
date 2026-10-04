// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Background transport resolution for embeddings + rerank.
 *
 * Both run off the chat hot path, so they declare the `background` task
 * signal and let `ModelRouter` order their candidate endpoints. The default
 * strategy scores unannotated endpoints 0, so the env-var precedence chain
 * below is the resolved order unless an operator annotates cost/latency.
 *
 * No second config mechanism: candidates come from the env chain the callers
 * already used, and routing only reorders them.
 */
import { ModelRouter, type RoutableModel, } from "../generation/routing/router";
import type { GenerationRoutingConfig, } from "../generation/routing/routing-config";
import { BACKGROUND, } from "../generation/routing/task-signal";

/** Fallback endpoint when no env var is set (local Ollama default). */
const DEFAULT_ENDPOINT = "http://localhost:11434";

/** One endpoint candidate in precedence order (highest first). */
interface EndpointCandidate extends RoutableModel {
  baseUrl: string;
}

/**
 * Read a non-empty env var, treating blank as unset.
 * @param name
 */
function envUrl(name: string,): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

/**
 * Resolve the endpoint for a background model call.
 * @param envNames - Env vars in descending precedence; the first match wins
 *   unless routing annotates a later one as cheaper/faster.
 * @param opts
 * @param opts.routing - `config.generation.routing`; absent = no reordering.
 * @param opts.model - Model id recorded on the candidate (routing is model-agnostic today).
 * @returns The winning base URL.
 */
export function resolveBackgroundEndpoint(
  envNames: string[],
  opts: { routing?: GenerationRoutingConfig; model?: string } = {},
): string {
  const candidates: EndpointCandidate[] = [];
  for (const name of envNames) {
    const baseUrl = envUrl(name,);
    if (baseUrl) { candidates.push({ name, model: opts.model ?? "", baseUrl, capabilities: {}, },); }
  }

  if (candidates.length === 0) { return DEFAULT_ENDPOINT; }
  if (candidates.length === 1) { return candidates[0]!.baseUrl; }
  return new ModelRouter(opts.routing,).route(BACKGROUND, candidates,).primary?.baseUrl ??
    candidates[0]!.baseUrl;
}
