// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the audio prompt template registry (FEAT-065-AUD):
 * profile resolution (incl. subtype support), variable substitution,
 * and message building.
 */
import { describe, expect, test, } from "bun:test";
import {
  AUDIO_TEMPLATE_VARIABLES,
  buildAudioPromptMessages,
  buildAudioSystemPrompt,
  BUILTIN_AUDIO_PROFILES,
  DEFAULT_AUDIO_PROFILE_REGISTRY,
  resolveAudioProfile,
  resolveTemplate,
} from "./audio-prompt-templates";

const CTX = {
  speaker: "Aria",
  emotion: "excited",
  tone: "whisper",
  pace: "slow",
  genre: "fantasy orchestral",
  mood: "epic battle",
  instrumentation: "drums, brass",
  text: "The dragon awakens",
};

describe("audio builtin profiles", () => {
  test("covers all seven ticket families with expected subtypes and formats", () => {
    expect(Object.keys(BUILTIN_AUDIO_PROFILES,).sort(),).toEqual(
      ["bark", "elevenlabs", "musicgen", "openai-tts", "piper", "riffusion", "stable-audio",],
    );

    expect(BUILTIN_AUDIO_PROFILES.elevenlabs!.subtypes.sort(),).toEqual(["sfx", "tts", "voice-clone",],);
    expect(BUILTIN_AUDIO_PROFILES.piper!.promptFormat,).toBe("ssml",);
    expect(BUILTIN_AUDIO_PROFILES["stable-audio"]!.promptFormat,).toBe("json",);
    expect(BUILTIN_AUDIO_PROFILES.musicgen!.promptFormat,).toBe("json",);
  });

  test("piper resolves SSML bodies; stable-audio resolves JSON bodies", () => {
    const { template: ssml, } = resolveAudioProfile("tts", "balanced", { profileId: "piper", },);
    expect(ssml,).toContain("<speak>",);
    expect(ssml,).toContain('rate="{{pace}}"',);
    const { template: json, } = resolveAudioProfile("music", "balanced", { profileId: "musicgen", },);
    expect(json,).toContain('"genre"',);
    expect(json,).toContain("{{instrumentation}}",);
  });

  test("unsupported subtypes carry empty builtin bodies (guard throws first)", () => {
    expect(BUILTIN_AUDIO_PROFILES.piper!.templates.music.instant,).toBe("",);
  });

  test("declares the ticket variables", () => {
    for (const key of ["speaker", "emotion", "tone", "pace", "genre", "mood", "instrumentation", "text",]) {
      expect(key in AUDIO_TEMPLATE_VARIABLES,).toBe(true,);
    }
  });
});

describe("resolveAudioProfile", () => {
  test("defaults to elevenlabs and matches tts-1 model names to openai-tts", () => {
    expect(resolveAudioProfile("tts", "balanced", {},).resolvedProfileId,).toBe("elevenlabs",);
    expect(resolveAudioProfile("tts", "balanced", { modelName: "tts-1-hd", },).resolvedProfileId,)
      .toBe("openai-tts",);

    expect(resolveAudioProfile("music", "balanced", { modelName: "MusicGen-Large", },).resolvedProfileId,)
      .toBe("musicgen",);
  });

  test("explicit profileId wins; unknown ids fall to default", () => {
    expect(resolveAudioProfile("sfx", "balanced", { profileId: "stable-audio", },).resolvedProfileId,)
      .toBe("stable-audio",);

    expect(resolveAudioProfile("tts", "balanced", { profileId: "ghost", },).resolvedProfileId,)
      .toBe("elevenlabs",);
  });

  test("throws when the resolved profile does not support the subtype", () => {
    expect(() => resolveAudioProfile("music", "balanced", { profileId: "piper", },))
      .toThrow('Audio profile "piper" does not support the "music" subtype',);

    expect(() => resolveAudioProfile("voice-clone", "balanced", { profileId: "openai-tts", },))
      .toThrow("voice-clone",);
  });

  test("template override replaces the builtin body", () => {
    const { template, } = resolveAudioProfile("tts", "balanced", { templateOverride: "say {{text}}", },);
    expect(template,).toBe("say {{text}}",);
  });

  test("unknown detail level falls back to balanced", () => {
    const { template, } = resolveAudioProfile("tts", "ultra" as never,);
    expect(template,).toBe(resolveAudioProfile("tts", "balanced", {},).template,);
  });
});

describe("resolveTemplate (audio substitution)", () => {
  test("fills TTS variables", () => {
    const { template, } = resolveAudioProfile("tts", "balanced", {},);
    const out = resolveTemplate(template, CTX,);
    expect(out,).toContain("Voice: Aria",);
    expect(out,).toContain("Emotion: excited",);
    expect(out,).toContain("The dragon awakens",);
  });
});

describe("buildAudioPromptMessages", () => {
  test("returns [system, user] with substituted user content", () => {
    const messages = buildAudioPromptMessages("tts", "balanced", CTX, { profileId: "elevenlabs", },);
    expect(messages,).toHaveLength(2,);
    expect(messages[0]!.role,).toBe("system",);
    expect(messages[0]!.content,).toContain("audio prompt writer",);
    expect(messages[0]!.content,).toContain("tts clip",);
    expect(messages[1]!.content,).not.toContain("{{text}}",);
    expect(messages[1]!.content,).toContain("The dragon awakens",);
  });

  test("system prompt format instruction follows the profile format", () => {
    const ssml = buildAudioSystemPrompt(BUILTIN_AUDIO_PROFILES.piper!, "tts", "detailed",);
    expect(ssml,).toContain("SSML",);
    const json = buildAudioSystemPrompt(BUILTIN_AUDIO_PROFILES.musicgen!, "music", "instant",);
    expect(json,).toContain("JSON object",);
    expect(json,).toContain("Be short",);
    const natural = buildAudioSystemPrompt(BUILTIN_AUDIO_PROFILES.elevenlabs!, "sfx", "balanced",);
    expect(natural,).toContain("natural language",);
  });

  test("default registry constant is the built-in one", () => {
    expect(DEFAULT_AUDIO_PROFILE_REGISTRY.profiles,).toBe(BUILTIN_AUDIO_PROFILES,);
  });
});
