// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Audio generation public surface (ambient / SFX / music).
 *
 * Importing this module registers the builtin "local" provider, so the
 * ambient path works with no provider config at all.
 */
import { createLocalAudioProvider, } from "./providers/local";
import { registerAudioProvider, } from "./types";

registerAudioProvider(createLocalAudioProvider(),);

export { buildAmbientLayers, generateAmbient, } from "./ambient";
export type { AmbientLayer, AmbientOutcome, AmbientSuccess, } from "./ambient";
export {
  generateAudio,
  registerAudioProviders,
  resolveAudioProvider,
} from "./engine";
export type { ResolvedAudioProvider, } from "./engine";
export { createComfyAudioProvider, } from "./providers/comfyui";
export type { ComfyAudioProviderOptions, } from "./providers/comfyui";
export { createLocalAudioProvider, } from "./providers/local";
export {
  getAudioProvider,
  listAudioProviders,
  registerAudioProvider,
  unregisterAudioProvider,
} from "./types";
export type {
  AudioGenFailure,
  AudioGenOutcome,
  AudioGenRequest,
  AudioGenSuccess,
  AudioProvider,
} from "./types";
export { decodeWav, encodeWav, mixLayers, } from "./wav";
export type { MixLayer, WavData, } from "./wav";
