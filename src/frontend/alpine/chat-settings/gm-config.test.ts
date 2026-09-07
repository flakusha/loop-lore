import { describe, expect, test, } from "bun:test";
import type { GmConfig, } from "../types";
import {
  buildActorModels,
  buildGmConfig,
  GM_CONFIG_PRESENTATION_KEYS,
  type GmSettingsFields,
  presentationGmConfig,
  readGmSettings,
  setStoryPaused,
} from "./gm-config";

const fullFields = {
  assistantRole: "gm",
  vnEnabled: true,
  vnLayout: "split",
  vnTypewriter: false,
  vnTypewriterSpeed: 60,
  vnTransition: "dissolve",
  vnAutoAdvance: true,
  imageScaling: "cover",
  autoAdvanceDelay: 9,
  dialogueBoxOpacity: 0.9,
  portraitSize: 50,
  splitRatio: 55,
  gmType: "hybrid",
  gmHumanActorId: "actor-7",
  gmEscalationThreshold: 0.8,
  gmModel: "glm-5",
  gmProvider: "zai",
  gmTemperature: 0.3,
  gmMaxTokens: 4096,
  responseLengthPreset: "custom",
  responseLengthCustom: 777,
  outputStylePreset: "noir",
  outputStyleIntensity: 0.9,
} as const;

describe("readGmSettings", () => {
  test("returns safe defaults for an empty config", () => {
    expect(readGmSettings({},),).toEqual({
      assistantRole: "off",
      vnEnabled: false,
      vnLayout: "overlay",
      vnTypewriter: true,
      vnTypewriterSpeed: 30,
      vnTransition: "fade",
      vnAutoAdvance: false,
      imageScaling: "auto",
      autoAdvanceDelay: 5,
      dialogueBoxOpacity: 0.75,
      portraitSize: 35,
      splitRatio: 40,
      gmType: "llm",
      gmHumanActorId: "",
      gmEscalationThreshold: 0.5,
      gmModel: "",
      gmProvider: "",
      gmTemperature: 0.7,
      gmMaxTokens: 2000,
      responseLengthPreset: "medium",
      responseLengthCustom: 1000,
      outputStylePreset: "",
      outputStyleIntensity: 0.5,
    },);
  });

  test("renderingOverride drives VN enablement over the legacy flag", () => {
    expect(readGmSettings({ renderingOverride: "visual_novel", visualNovel: false, },).vnEnabled,).toBe(true,);
    expect(readGmSettings({ renderingOverride: null, visualNovel: true, },).vnEnabled,).toBe(true,);
    expect(readGmSettings({ renderingOverride: null, },).vnEnabled,).toBe(false,);
    expect(readGmSettings({ renderingOverride: "chat_bubble" as never, visualNovel: true, },).vnEnabled,).toBe(false,);
  });

  test("reads every explicit field", () => {
    const config: GmConfig = {
      assistantRole: "helper",
      renderingOverride: "visual_novel",
      vnLayout: "below",
      vnTypewriter: false,
      vnTypewriterSpeed: 10,
      vnTransition: "slide",
      vnAutoAdvance: true,
      vnImageScaling: "fill",
      vnAutoAdvanceDelay: 2,
      vnDialogueBoxOpacity: 0.5,
      vnPortraitSize: 25,
      vnSplitRatio: 60,
      type: "human",
      humanGM: { actorId: "a9", notifications: true, },
      escalationThreshold: 0.2,
      llmConfig: { model: "m", provider: "p", systemPrompt: "", temperature: 1, maxTokens: 100, },
      responseLengthPreset: "short",
      responseLengthCustom: 42,
      outputStyle: { preset: "noir", intensity: 1, },
    };
    const fields = readGmSettings(config,);
    expect(fields.assistantRole,).toBe("helper",);
    expect(fields.vnLayout,).toBe("below",);
    expect(fields.gmType,).toBe("human",);
    expect(fields.gmHumanActorId,).toBe("a9",);
    expect(fields.gmModel,).toBe("m",);
    expect(fields.responseLengthPreset,).toBe("short",);
    expect(fields.outputStylePreset,).toBe("noir",);
    expect(fields.outputStyleIntensity,).toBe(1,);
  });
});

describe("buildGmConfig", () => {
  test("hybrid + VN config persists every section", () => {
    const existing = { systemPromptCarry: "keep-me", llmConfig: { old: true, }, } as unknown as GmConfig;
    const out = buildGmConfig(existing, fullFields, { a1: { model: " m1 ", provider: " p1 ", }, },);
    expect(out.systemPromptCarry,).toBe("keep-me",);
    expect(out.renderingOverride,).toBe("visual_novel",);
    expect(out.type,).toBe("hybrid",);
    expect(out.humanGM,).toEqual({ actorId: "actor-7", notifications: true, },);
    expect(out.escalationThreshold,).toBe(0.8,);
    expect(out.llmConfig,).toEqual({
      model: "glm-5",
      provider: "zai",
      systemPrompt: "",
      temperature: 0.3,
      maxTokens: 4096,
    },);
    expect(out.actorModels,).toEqual({ a1: { model: "m1", provider: "p1", }, },);
    expect(out.responseLengthPreset,).toBe("custom",);
    expect(out.responseLengthCustom,).toBe(777,);
    expect(out.outputStyle,).toEqual({ preset: "noir", intensity: 0.9, },);
  });

  test("llm-only config prunes human GM, escalation and custom length", () => {
    const fields: GmSettingsFields = {
      ...fullFields,
      gmType: "llm",
      responseLengthPreset: "long",
      outputStylePreset: "",
      vnEnabled: false,
    };
    const out = buildGmConfig({}, fields, {},);
    expect(out.renderingOverride,).toBeNull();
    expect("humanGM" in out,).toBe(false,);
    expect("escalationThreshold" in out,).toBe(false,);
    expect("responseLengthCustom" in out,).toBe(false,);
    expect("outputStyle" in out,).toBe(false,);
  });

  test("a blank model deletes llmConfig even when the old config had one", () => {
    const fields = { ...fullFields, gmModel: "   ", };
    const existing = { llmConfig: { model: "old", }, } as unknown as GmConfig;
    const out = buildGmConfig(existing, fields, {},);
    expect("llmConfig" in out,).toBe(false,);
  });

  test("human GM config keeps the actor but drops the escalation threshold", () => {
    const fields: GmSettingsFields = { ...fullFields, gmType: "human", };
    const out = buildGmConfig({}, fields, {},);
    expect(out.humanGM,).toEqual({ actorId: "actor-7", notifications: true, },);
    expect("escalationThreshold" in out,).toBe(false,);
  });

  test("blank actor models are pruned; all-blank removes the section", () => {
    const fields = { ...fullFields, };
    const out = buildGmConfig({}, fields, {
      keep: { model: "m", provider: "", },
      blank: { model: "  ", provider: "p", },
    },);
    expect(out.actorModels,).toEqual({ keep: { model: "m", provider: "", }, },);
    const none = buildGmConfig({}, fields, { blank: { model: "", provider: "p", }, },);
    expect("actorModels" in none,).toBe(false,);
  });
});

describe("buildActorModels", () => {
  test("trims values and drops blank models", () => {
    expect(buildActorModels({
      a: { model: " m ", provider: " p ", },
      b: { model: " ", provider: "p", },
      c: { model: "m2", provider: undefined as unknown as string, },
    },),).toEqual({
      a: { model: "m", provider: "p", },
      c: { model: "m2", provider: "", },
    },);
  });
});

describe("presentationGmConfig", () => {
  test("keeps only defined presentation keys", () => {
    const out = presentationGmConfig({
      renderingOverride: "visual_novel",
      vnLayout: undefined,
      type: "llm", // not a presentation key — must be dropped
      llmConfig: { model: "m", },
      responseLengthPreset: "long",
    },);
    expect(out,).toEqual({ renderingOverride: "visual_novel", responseLengthPreset: "long", },);
    expect(Object.keys(out,).every((k,) => (GM_CONFIG_PRESENTATION_KEYS as readonly string[]).includes(k,)),).toBe(
      true,
    );
  });

  test("returns an empty object for an empty or foreign blob", () => {
    expect(presentationGmConfig({},),).toEqual({},);
    expect(presentationGmConfig({ type: "human", },),).toEqual({},);
  });
});

describe("setStoryPaused", () => {
  test("sets isPaused on existing valid JSON", () => {
    const chat = { story_state: '{"hp":10,"isPaused":false}', };
    setStoryPaused(chat, true,);
    expect(JSON.parse(chat.story_state!,),).toEqual({ hp: 10, isPaused: true, },);
  });

  test("recovers with a fresh blob when the stored JSON is damaged", () => {
    const chat = { story_state: "{not json", };
    setStoryPaused(chat, true,);
    // jsonParseOr falls back to {}, so the damaged state is replaced by a
    // minimal valid story state rather than corrupt output.
    expect(JSON.parse(chat.story_state!,),).toEqual({ isPaused: true, },);
  });

  test("creates a fresh story state when absent", () => {
    const chat: { story_state?: string } = {};
    setStoryPaused(chat, true,);
    expect(JSON.parse(chat.story_state!,),).toEqual({ isPaused: true, },);
    setStoryPaused(chat, false,);
    expect(JSON.parse(chat.story_state!,),).toEqual({ isPaused: false, },);
  });
});
