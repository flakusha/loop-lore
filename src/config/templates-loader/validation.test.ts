// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for template config validators (`llm` / `sd` / `avatar` / `imageEdit`).
 *
 * Pure shape checks: valid configs pass through silent, malformed configs
 * throw actionable errors, and near-miss prompt purposes emit a warning.
 */
import { describe, expect, test, } from "bun:test";
import {
  validateAvatarConfig,
  validateImageEditConfig,
  validateLlmConfig,
  validateSdConfig,
  warnUnknownPromptPurposes,
} from "./validation";

/** Capture `process.emitWarning` calls made while `fn` runs. */
function captureWarnings(fn: () => void,): (string | Error)[][] {
  const calls: (string | Error)[][] = [];
  const orig = process.emitWarning;
  process.emitWarning = ((warning: string | Error,) => {
    calls.push([warning,],);
  }) as typeof process.emitWarning;
  try {
    fn();
  } finally {
    process.emitWarning = orig;
  }
  return calls;
}

describe("validateLlmConfig", () => {
  test("returns null for a different domain", () => {
    expect(validateLlmConfig({ profiles: {}, },),).toBeNull();
  });

  test("passes a valid config through", () => {
    const raw = {
      merge: "extend",
      systemPrompts: { chat: "Be helpful.", },
      chatFormats: { default: { system: "s", user: "u", assistant: "a", }, },
    };
    expect(validateLlmConfig(raw,),).toBe(raw,);
  });

  test("accepts merge-only config (optional sections undefined)", () => {
    expect(validateLlmConfig({ merge: "replace", },),).toEqual({ merge: "replace", },);
  });

  test("rejects an illegal merge strategy", () => {
    expect(() => validateLlmConfig({ merge: "explode", },)).toThrow(/merge must be one of/,);
  });

  test("rejects a non-string merge", () => {
    expect(() => validateLlmConfig({ merge: 42, },)).toThrow(/merge must be one of/,);
  });

  test("rejects non-object systemPrompts", () => {
    expect(() => validateLlmConfig({ systemPrompts: "nope", },)).toThrow(
      /systemPrompts must be an object/,
    );
  });

  test("rejects non-string prompt values", () => {
    expect(() => validateLlmConfig({ systemPrompts: { chat: 7, }, },)).toThrow(TypeError,);
    expect(() => validateLlmConfig({ systemPrompts: { chat: 7, }, },)).toThrow(
      /systemPrompts\.chat must be a string/,
    );
  });

  test("rejects chatFormats entries missing a role", () => {
    const raw = { chatFormats: { broken: { system: "s", user: "u", }, }, };
    expect(() => validateLlmConfig(raw,)).toThrow(/chatFormats\.broken\.assistant must be a string/,);
  });

  test("rejects non-object chatFormats entries", () => {
    const raw = { chatFormats: { broken: "flat", }, };
    expect(() => validateLlmConfig(raw,)).toThrow(/chatFormats\.broken must be an object/,);
    expect(() => validateLlmConfig({ chatFormats: "flat", },)).toThrow(
      /chatFormats must be an object mapping/,
    );
  });
});

describe("validateSdConfig", () => {
  test("passes empty config", () => {
    expect(() => validateSdConfig({},)).not.toThrow();
  });

  test("passes a valid config", () => {
    expect(() =>
      validateSdConfig({
        profiles: { base: { name: "Base", maxTokenHint: 75, defaults: {}, }, },
        modelMatching: [{ pattern: "sdxl", profileId: "base", },],
      },)
    ).not.toThrow();
  });

  test("rejects array profiles", () => {
    expect(() => validateSdConfig({ profiles: [], },)).toThrow(/profiles must be an object/,);
  });

  test("rejects non-object profile entries and bad field types", () => {
    expect(() => validateSdConfig({ profiles: { p: "flat", }, },)).toThrow(
      /profiles\.p must be an object/,
    );
    expect(() => validateSdConfig({ profiles: { p: { name: 1, }, }, },)).toThrow(TypeError,);
    expect(() => validateSdConfig({ profiles: { p: { maxTokenHint: "lots", }, }, },)).toThrow(
      /maxTokenHint must be a number/,
    );
    expect(() => validateSdConfig({ profiles: { p: { promptFormat: 7, }, }, },)).toThrow(
      /promptFormat must be a string/,
    );
    expect(() => validateSdConfig({ profiles: { p: { defaults: "flat", }, }, },)).toThrow(
      /defaults must be an object/,
    );
  });

  test("rejects malformed modelMatching rules", () => {
    expect(() => validateSdConfig({ modelMatching: {}, },)).toThrow(/modelMatching must be an array/,);
    expect(() => validateSdConfig({ modelMatching: [{ pattern: "x", },], },)).toThrow(
      /modelMatching\[0\] must have string pattern and profileId/,
    );
  });
});

describe("validateAvatarConfig", () => {
  test("passes empty config", () => {
    expect(() => validateAvatarConfig({},)).not.toThrow();
  });

  test("passes a valid config", () => {
    expect(() =>
      validateAvatarConfig({
        emotions: { happy: { asset: "happy.png", intent: "smile", }, },
        intentPatterns: ["smile",],
      },)
    ).not.toThrow();
  });

  test("rejects malformed emotions", () => {
    expect(() => validateAvatarConfig({ emotions: [], },)).toThrow(/emotions must be an object/,);
    expect(() => validateAvatarConfig({ emotions: { happy: "flat", }, },)).toThrow(
      /emotions\.happy must be an object/,
    );
    expect(() => validateAvatarConfig({ emotions: { happy: {}, }, },)).toThrow(
      /emotions\.happy\.asset must be a string/,
    );
    expect(() => validateAvatarConfig({ emotions: { happy: { asset: "h.png", intent: 3, }, }, },)).toThrow(
      /emotions\.happy\.intent must be a string/,
    );
  });

  test("rejects non-array intentPatterns", () => {
    expect(() => validateAvatarConfig({ intentPatterns: "smile", },)).toThrow(
      /intentPatterns must be an array/,
    );
  });
});

describe("validateImageEditConfig", () => {
  test("passes empty config", () => {
    expect(() => validateImageEditConfig({},)).not.toThrow();
  });

  test("passes a valid config", () => {
    expect(() =>
      validateImageEditConfig({
        workflows: { retouch: { name: "Retouch", category: "photo", backend: "sd", }, },
      },)
    ).not.toThrow();
  });

  test("rejects malformed workflows", () => {
    expect(() => validateImageEditConfig({ workflows: [], },)).toThrow(/workflows must be an object/,);
    expect(() => validateImageEditConfig({ workflows: { w: "flat", }, },)).toThrow(
      /workflows\.w must be an object/,
    );
    expect(() => validateImageEditConfig({ workflows: { w: { name: 1, }, }, },)).toThrow(
      /workflows\.w\.name must be a string/,
    );
  });
});

describe("warnUnknownPromptPurposes", () => {
  test("stays silent for known purposes", () => {
    const warnings = captureWarnings(() => warnUnknownPromptPurposes({ chat: "x", gm: "y", },));
    expect(warnings,).toEqual([],);
  });

  test("warns on a near-miss typo with a suggestion", () => {
    const warnings = captureWarnings(() => warnUnknownPromptPurposes({ sumarize: "x", },));
    expect(warnings,).toHaveLength(1,);
    expect(String(warnings[0]?.[0],),).toContain('"summarize"',);
  });

  test("stays silent for far-away custom keys", () => {
    const warnings = captureWarnings(() => warnUnknownPromptPurposes({ my_totally_custom_setting: "x", },));
    expect(warnings,).toEqual([],);
  });

  test("ignores non-object input", () => {
    const warnings = captureWarnings(() => warnUnknownPromptPurposes("chat",));
    expect(warnings,).toEqual([],);
  });
});
