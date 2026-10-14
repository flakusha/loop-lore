// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ambient scene audio — scene tags to a layered, mixed track.
 *
 * Pipe: scene tags -> layer plan (one provider request per layer) -> decode
 * each layer -> mixLayers (gain + edge fades) -> 16-bit WAV.
 * Layer prompts render the builtin SFX audio-profile template, so a
 * model-backed provider and the local procedural provider see the same text.
 */
import { resolveAudioProfile, } from "../audio-prompt-templates";
import { resolveAudioProvider, } from "./engine";
import type { AudioGenFailure, } from "./types";
import { decodeWav, encodeWav, mixLayers, } from "./wav";
import type { MixLayer, } from "./wav";

/** Scene tag -> procedural texture + prompt label. */
const SCENE_TEXTURES: Record<string, { texture: string; label: string }> = {
  rain: { texture: "rain", label: "falling rain", },
  storm: { texture: "rain", label: "heavy rain and wind", },
  forest: { texture: "forest", label: "rustling forest at day", },
  night: { texture: "night", label: "quiet night with crickets", },
  cave: { texture: "cave", label: "echoing cave with water drips", },
  city: { texture: "city", label: "distant city traffic", },
  wind: { texture: "wind", label: "howling wind", },
  fire: { texture: "fire", label: "crackling campfire", },
  water: { texture: "water", label: "flowing water", },
  river: { texture: "water", label: "flowing river", },
  stream: { texture: "water", label: "babbling stream", },
};

/** Texture for unmapped tags. */
const FALLBACK_TEXTURE = { texture: "bed", label: "soft ambient bed", };

/** Max layers per track — bounds per-request generation cost. */
const MAX_LAYERS = 4;

/** One layer of the ambient plan. */
export interface AmbientLayer {
  /** Scene tag this layer came from (as supplied, lowercased). */
  tag: string;
  /** Provider prompt for the layer. */
  prompt: string;
  /** Procedural texture id (local provider only). */
  texture: string;
  /** Linear mix gain for the layer. */
  volume: number;
}

/** A generated ambient track. */
export interface AmbientSuccess {
  ok: true;
  buffer: Buffer;
  mimeType: string;
  /** Requested track length in seconds. */
  seconds: number;
  /** Layers that were generated and mixed, in mix order. */
  layers: AmbientLayer[];
  /** Provider id that generated the layers. */
  providerId: string;
}

/** */
export type AmbientOutcome = AmbientSuccess | AudioGenFailure;

/**
 * Substitute {{variables}} and drop leftovers, mirroring applySimpleTemplate.
 * @param template
 * @param vars
 */
function renderTemplate(template: string, vars: Record<string, string>,): string {
  let out = template;
  for (const [key, value,] of Object.entries(vars,)) {
    out = out.replaceAll(`{{${key}}}`, value,);
  }

  return out.replace(/\{\{[^}]+\}\}/g, "",);
}

/**
 * Turn scene tags into a layer plan (base tag first, extras scaled by
 * intensity), capped at MAX_LAYERS.
 * @param opts
 * @returns The layer plan in mix order.
 * @throws {Error} When no usable tag is supplied.
 */
export function buildAmbientLayers(opts: {
  tags: readonly string[];
  intensity?: number;
  mood?: string;
  profileId?: string;
},): AmbientLayer[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of opts.tags) {
    const tag = raw.trim().toLowerCase();
    if (tag && !seen.has(tag,)) {
      seen.add(tag,);
      tags.push(tag,);
    }
  }

  if (tags.length === 0) { throw new Error("At least one scene tag is required",); }

  const intensity = Math.max(0, Math.min(1, opts.intensity ?? 0.5,),);
  const mood = opts.mood ?? "calm";
  const { template, } = resolveAudioProfile(
    "sfx",
    "balanced",
    opts.profileId ? { profileId: opts.profileId, } : {},
  );

  return tags.slice(0, MAX_LAYERS,).map((tag, index,) => {
    const mapped = SCENE_TEXTURES[tag] ?? FALLBACK_TEXTURE;
    return {
      tag,
      prompt: renderTemplate(template, {
        text: `ambient ${mapped.label} bed, loopable`,
        mood,
      },),
      texture: mapped.texture,
      // First tag is the base bed; extras ride on top, louder with intensity.
      volume: index === 0 ? 0.9 : 0.25 + 0.5 * intensity,
    };
  },);
}

/**
 * Generate and mix an ambient track for the given scene tags.
 * @param opts
 * @returns The mixed WAV track, or the provider failure to report.
 */
export async function generateAmbient(opts: {
  tags: readonly string[];
  durationSec?: number;
  intensity?: number;
  mood?: string;
  seed?: number;
  /** Provider id override; default resolution (comfyui first, else local). */
  provider?: string;
  /** Audio profile id used for layer prompt rendering. */
  profileId?: string;
},): Promise<AmbientOutcome> {
  const layers: AmbientLayer[] = buildAmbientLayers({
    tags: opts.tags,
    intensity: opts.intensity,
    mood: opts.mood,
    profileId: opts.profileId,
  },);

  const resolved = resolveAudioProvider({ provider: opts.provider, },);
  if (!resolved.ok) { return resolved; }

  const seconds = Math.max(1, Math.min(300, Math.round(opts.durationSec ?? 30,),),);
  const mixInput: MixLayer[] = [];
  const used: AmbientLayer[] = [];
  let sampleRate = 32_000;

  for (const layer of layers) {
    const outcome = await resolved.provider.generate({
      prompt: layer.prompt,
      seconds,
      texture: layer.texture,
      seed: opts.seed,
    },);

    if (!outcome.ok) { return outcome; }

    const decoded = decodeWav(outcome.buffer,);
    sampleRate = decoded.sampleRate;
    used.push(layer,);
    mixInput.push({
      data: decoded,
      volume: layer.volume,
      fadeInSec: 1.5,
      fadeOutSec: 1.5,
    },);
  }

  const mixed = mixLayers({ layers: mixInput, durationSec: seconds, sampleRate, },);
  return {
    ok: true,
    buffer: encodeWav(mixed,),
    mimeType: "audio/wav",
    seconds,
    layers: used,
    providerId: resolved.provider.id,
  };
}
