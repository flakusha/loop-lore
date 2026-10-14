// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Audio generation engine — provider registration + request dispatch.
 *
 * Resolution order: explicit `provider` id, the first registered ComfyUI
 * provider, then the builtin "local" procedural provider (always available).
 */
import type { Config, } from "../../config/schema/config";
import { createComfyAudioProvider, } from "./providers/comfyui";
import { createLocalAudioProvider, } from "./providers/local";
import { getAudioProvider, listAudioProviders, registerAudioProvider, } from "./types";
import type { AudioGenOutcome, AudioGenRequest, AudioProvider, } from "./types";

/** A resolved provider, or the failure to report back to the caller. */
export type ResolvedAudioProvider =
  | { ok: true; provider: AudioProvider }
  | { ok: false; error: string; status: number };

/**
 * Register every provider described by config. Call once at startup; calling
 * again re-registers the same ids, so config reloads are safe.
 * @param config - Optional; without it only "local" is registered.
 * @returns The registered provider ids.
 */
export function registerAudioProviders(config?: Config,): string[] {
  registerAudioProvider(createLocalAudioProvider(),);

  for (const entry of config?.generation.providers.audio ?? []) {
    if (entry.apiFamily !== "comfyui") { continue; }
    registerAudioProvider(createComfyAudioProvider({
      baseUrl: entry.baseUrl,
      workflow: entry.workflow,
      generationTimeout: entry.generationTimeout,
    },),);
  }

  return listAudioProviders();
}

/**
 * Resolve the provider for a request.
 * @param opts
 * @returns The provider, or a failure (400 unknown id / 503 none registered).
 */
export function resolveAudioProvider(opts: { provider?: string } = {},): ResolvedAudioProvider {
  if (opts.provider) {
    const provider = getAudioProvider(opts.provider,);
    if (!provider) {
      return { ok: false, error: `Unknown audio provider "${opts.provider}"`, status: 400, };
    }

    return { ok: true, provider, };
  }

  for (const id of listAudioProviders()) {
    if (id.startsWith("comfyui:",)) {
      return { ok: true, provider: getAudioProvider(id,) as AudioProvider, };
    }
  }

  const local = getAudioProvider("local",);
  if (!local) {
    return {
      ok: false,
      error: "No audio provider registered — call registerAudioProviders() at startup",
      status: 503,
    };
  }

  return { ok: true, provider: local, };
}

/**
 * Generate one audio track with the resolved provider.
 * @param opts
 * @returns The provider outcome.
 */
export async function generateAudio(opts: {
  request: AudioGenRequest;
  provider?: string;
},): Promise<AudioGenOutcome> {
  const resolved = resolveAudioProvider({ provider: opts.provider, },);
  if (!resolved.ok) { return resolved; }
  return resolved.provider.generate(opts.request,);
}
