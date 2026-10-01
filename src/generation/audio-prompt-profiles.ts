// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Builtin audio profile construction (FEAT-065-AUD).
 *
 * One profile per model family (ElevenLabs v3, OpenAI TTS, Piper, Bark,
 * Stable Audio, MusicGen, Riffusion). Template bodies derive from a
 * per-subtype table with SSML/JSON format overrides; the resolution layer
 * lives in `audio-prompt-templates.ts`.
 */
import type {
  AudioModelFamily,
  AudioModelProfile,
  AudioProfileRegistry,
  AudioPromptFormat,
  AudioSubtype,
} from "./audio-prompt-templates";

/** Natural-language bodies per sub-type, keyed by detail level. */
const NATURAL_BODIES: Record<AudioSubtype, Record<"instant" | "balanced" | "detailed", string>> = {
  tts: {
    instant: "Voice: {{speaker}}. Read aloud: {{text}}",
    balanced: "Voice: {{speaker}}. Emotion: {{emotion}}. Tone: {{tone}}, pace {{pace}}. Read aloud: {{text}}",
    detailed: "Voice: {{speaker}}. Emotion: {{emotion}}. Tone: {{tone}}. Pace: {{pace}}." +
      " Read aloud with feeling: {{text}}",
  },
  sfx: {
    instant: "Sound effect: {{text}}. Mood: {{mood}}.",
    balanced: "Sound effect: {{text}}. Mood: {{mood}}. Short, distinct, instantly readable.",
    detailed: "Sound effect: {{text}}. Mood: {{mood}}. Layered and distinct, no music, no vocals." +
      " Capture texture and dynamics.",
  },
  music: {
    instant: "Music: {{genre}}. Mood: {{mood}}.",
    balanced: "Music: {{genre}}. Mood: {{mood}}. Instrumentation: {{instrumentation}}.",
    detailed: "Music: {{genre}}. Mood: {{mood}}. Instrumentation: {{instrumentation}}." +
      " Composed, loopable, no vocals.",
  },
  "voice-clone": {
    instant: "Clone the reference voice of {{speaker}}. Read: {{text}}",
    balanced: "Clone the reference voice of {{speaker}}. Emotion: {{emotion}}. Read: {{text}}",
    detailed: "Clone the reference voice of {{speaker}}, matching timbre exactly. Emotion: {{emotion}}." +
      " Tone: {{tone}}, pace {{pace}}. Read: {{text}}",
  },
};

/** SSML bodies override the natural TTS bodies for SSML-format profiles. */
const SSML_TTS_BODIES: Record<"instant" | "balanced" | "detailed", string> = {
  instant: "<speak>{{text}}</speak>",
  balanced: '<speak><prosody rate="{{pace}}">{{text}}</prosody></speak>',
  detailed: '<speak><prosody rate="{{pace}}" pitch="{{tone}}">{{text}}</prosody></speak>',
};

/** JSON bodies override SFX/music for JSON-format profiles. */
const JSON_BODIES: Partial<Record<AudioSubtype, Record<"instant" | "balanced" | "detailed", string>>> = {
  sfx: {
    instant: 'Output JSON: {"description": "{{text}}", "mood": "{{mood}}"}',
    balanced: 'Output JSON: {"description": "{{text}}", "mood": "{{mood}}", "duration_seconds": 5}',
    detailed: 'Output JSON: {"description": "{{text}}", "mood": "{{mood}}", "duration_seconds": 5,' +
      ' "layers": ["texture", "dynamics"]}',
  },
  music: {
    instant: 'Output JSON: {"genre": "{{genre}}", "mood": "{{mood}}"}',
    balanced: 'Output JSON: {"genre": "{{genre}}", "mood": "{{mood}}", "instrumentation": "{{instrumentation}}"}',
    detailed: 'Output JSON: {"genre": "{{genre}}", "mood": "{{mood}}", "instrumentation": "{{instrumentation}}",' +
      ' "loop": true, "vocals": false}',
  },
};

/**
 * Bodies for one format: natural table, SSML/JSON overrides, then blanks
 * for sub-types the profile does not support (the resolver guard throws
 * before they are ever read).
 */
function templatesFor(
  format: AudioPromptFormat,
  subtypes: readonly AudioSubtype[],
): Record<AudioSubtype, Record<"instant" | "balanced" | "detailed", string>> {
  const templates = {
    tts: { ...NATURAL_BODIES.tts, },
    sfx: { ...NATURAL_BODIES.sfx, },
    music: { ...NATURAL_BODIES.music, },
    "voice-clone": { ...NATURAL_BODIES["voice-clone"], },
  };
  if (format === "ssml") { templates.tts = { ...SSML_TTS_BODIES, }; }
  if (format === "json") {
    templates.sfx = { ...JSON_BODIES.sfx!, };
    templates.music = { ...JSON_BODIES.music!, };
  }
  const empty = { instant: "", balanced: "", detailed: "", };
  for (const subtype of ["tts", "sfx", "music", "voice-clone",] as const) {
    if (!subtypes.includes(subtype,)) { templates[subtype] = { ...empty, }; }
  }
  return templates;
}

/** Per-family spec table; profiles derive from it so families stay in sync. */
const FAMILY_SPECS: Record<
  AudioModelFamily,
  { name: string; subtypes: AudioSubtype[]; format: AudioPromptFormat }
> = {
  elevenlabs: { name: "ElevenLabs v3", subtypes: ["tts", "sfx", "voice-clone",], format: "natural", },
  "openai-tts": { name: "OpenAI TTS (tts-1/tts-1-hd)", subtypes: ["tts",], format: "natural", },
  piper: { name: "Piper", subtypes: ["tts",], format: "ssml", },
  bark: { name: "Bark", subtypes: ["tts", "voice-clone",], format: "natural", },
  "stable-audio": { name: "Stable Audio", subtypes: ["sfx",], format: "json", },
  musicgen: { name: "MusicGen", subtypes: ["music",], format: "json", },
  riffusion: { name: "Riffusion", subtypes: ["music",], format: "natural", },
};

/** Built-in read-only audio profiles, keyed by profile id. */
export const BUILTIN_AUDIO_PROFILES: Record<string, AudioModelProfile> = Object.fromEntries(
  Object.entries(FAMILY_SPECS,).map(([id, spec,],) => [
    id,
    {
      id,
      name: spec.name,
      families: [id as AudioModelFamily,],
      subtypes: spec.subtypes,
      promptFormat: spec.format,
      maxTokenHint: 600,
      templates: templatesFor(spec.format, spec.subtypes,),
    } satisfies AudioModelProfile,
  ]),
);

/** Default audio registry: model-name matching (first match wins) + elevenlabs default. */
export const DEFAULT_AUDIO_PROFILE_REGISTRY: AudioProfileRegistry = {
  profiles: BUILTIN_AUDIO_PROFILES,
  defaultProfileId: "elevenlabs",
  modelMatching: [
    { pattern: "elevenlabs", profileId: "elevenlabs", },
    { pattern: "tts-1", profileId: "openai-tts", },
    { pattern: "piper", profileId: "piper", },
    { pattern: "bark", profileId: "bark", },
    { pattern: "stable-audio", profileId: "stable-audio", },
    { pattern: "musicgen", profileId: "musicgen", },
    { pattern: "riffusion", profileId: "riffusion", },
  ],
};
