// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Audio provider contract + registry (ambient/SFX/music generation).
 * Mirrors the image engine outcome shape so routes treat them alike.
 */

/** One audio generation request. */
export interface AudioGenRequest {
  /** Provider prompt — natural language for model-backed providers. */
  prompt: string;
  /** Track length in seconds. */
  seconds: number;
  /** Generation seed; providers must honor it for reproducibility. */
  seed?: number;
  /** Procedural texture id — consumed by the local provider only. */
  texture?: string;
}

/** Success carries the generated track bytes. */
export interface AudioGenSuccess {
  ok: true;
  buffer: Buffer;
  /** MIME type of `buffer` ("audio/wav"). */
  mimeType: string;
}

/** Failure carries a human error and the HTTP status to report. */
export interface AudioGenFailure {
  ok: false;
  error: string;
  status: number;
}

/** */
export type AudioGenOutcome = AudioGenSuccess | AudioGenFailure;

/** */
export interface AudioProvider {
  readonly id: string;
  /**
   * Generate one audio track.
   * @param request
   * @returns Success or a failure carrying the HTTP status to report.
   */
  generate(request: AudioGenRequest,): Promise<AudioGenOutcome>;
}

// ── Registry ──────────────────────────────────────────────

const registry = new Map<string, AudioProvider>();

/**
 * Register an audio provider. A re-register replaces the previous instance.
 * @param provider
 */
export function registerAudioProvider(provider: AudioProvider,): void {
  registry.set(provider.id, provider,);
}

/**
 * @param id - Provider id
 * @returns The registered provider, or undefined.
 */
export function getAudioProvider(id: string,): AudioProvider | undefined {
  return registry.get(id,);
}

/**
 * @returns Every registered audio provider id.
 */
export function listAudioProviders(): string[] {
  return Array.from(registry.keys(),);
}

/**
 * Drop a provider from the registry (test isolation + config reload).
 * @param id
 */
export function unregisterAudioProvider(id: string,): void {
  registry.delete(id,);
}
