// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Validation rules for the translation providers and the response-header
// policies. Sibling of schema-class.test.ts (which owns the generic rules);
// this file owns the branches the translation-feature work added.
//
// Resource contract: pure functions over a cloned default config — no DB,
// no files, no ports.
import { describe, expect, test, } from "bun:test";
import { createConfigSchema, } from "./index";
import { validate, } from "./validate";

/**
 * A mutable clone of the default config.
 */
function defaults() {
  return structuredClone(createConfigSchema().defaults,);
}

describe("validate — translation providers", () => {
  test("accepts a fully-configured DeepL provider", () => {
    const cfg = defaults();
    cfg.generation.providers.deepl = {
      name: "deepl",
      label: "DeepL",
      authKey: "key-1",
      freeTier: true,
      model: "en-us",
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: false,
    };

    expect(() => {
      validate(cfg,);
    },).not.toThrow();
  });

  test("throws for a DeepL provider without an authKey", () => {
    const cfg = defaults();
    cfg.generation.providers.deepl = {
      name: "deepl",
      label: "DeepL",
      authKey: "",
      freeTier: true,
      model: "en-us",
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: false,
    };

    expect(() => {
      validate(cfg,);
    },).toThrow("deepl requires authKey",);
  });

  test("throws for a DeepL provider without a default target language", () => {
    const cfg = defaults();
    cfg.generation.providers.deepl = {
      name: "deepl",
      label: "DeepL",
      authKey: "key-1",
      freeTier: true,
      model: "",
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: false,
    };

    expect(() => {
      validate(cfg,);
    },).toThrow("deepl requires model",);
  });

  test("accepts a fully-configured LibreTranslate provider", () => {
    const cfg = defaults();
    cfg.generation.providers.libretranslate = {
      name: "lt",
      label: "LibreTranslate",
      baseUrl: "https://libretranslate.com",
      model: "en",
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: false,
    };

    expect(() => {
      validate(cfg,);
    },).not.toThrow();
  });

  test("throws for a LibreTranslate provider without a baseUrl", () => {
    const cfg = defaults();
    cfg.generation.providers.libretranslate = {
      name: "lt",
      label: "LibreTranslate",
      baseUrl: "",
      model: "en",
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: false,
    };

    expect(() => {
      validate(cfg,);
    },).toThrow("libretranslate requires baseUrl",);
  });

  test("throws for a LibreTranslate provider without a default target language", () => {
    const cfg = defaults();
    cfg.generation.providers.libretranslate = {
      name: "lt",
      label: "LibreTranslate",
      baseUrl: "https://libretranslate.com",
      model: "",
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: false,
    };

    expect(() => {
      validate(cfg,);
    },).toThrow("libretranslate requires model",);
  });

  test("accepts a fully-configured Google Translate provider", () => {
    const cfg = defaults();
    cfg.generation.providers.googleTranslate = {
      name: "gt",
      label: "Google Translate",
      apiKey: "g-key",
      model: "en",
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: false,
    };

    expect(() => {
      validate(cfg,);
    },).not.toThrow();
  });

  test("throws for a Google Translate provider without an apiKey", () => {
    const cfg = defaults();
    cfg.generation.providers.googleTranslate = {
      name: "gt",
      label: "Google Translate",
      apiKey: "",
      model: "en",
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: false,
    };

    expect(() => {
      validate(cfg,);
    },).toThrow("googleTranslate requires apiKey",);
  });

  test("throws for a Google Translate provider without a default target language", () => {
    const cfg = defaults();
    cfg.generation.providers.googleTranslate = {
      name: "gt",
      label: "Google Translate",
      apiKey: "g-key",
      model: "",
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: false,
    };

    expect(() => {
      validate(cfg,);
    },).toThrow("googleTranslate requires model",);
  });
});

describe("validate — response-header policies", () => {
  test("throws for an unknown x-frame-options value", () => {
    const cfg = defaults();
    (cfg.headers as unknown as Record<string, unknown>).xFrameOptions = "ALLOW-FROM";
    expect(() => {
      validate(cfg,);
    },).toThrow("xFrameOptions",);
  });

  test("throws for an unknown cross-origin-opener-policy value", () => {
    const cfg = defaults();
    (cfg.headers as unknown as Record<string, unknown>).crossOriginOpenerPolicy = "unsafe-none";
    expect(() => {
      validate(cfg,);
    },).toThrow("crossOriginOpenerPolicy",);
  });

  test("throws for an unknown cross-origin-embedder-policy value", () => {
    const cfg = defaults();
    (cfg.headers as unknown as Record<string, unknown>).crossOriginEmbedderPolicy = "require-corp-unknown";
    expect(() => {
      validate(cfg,);
    },).toThrow("crossOriginEmbedderPolicy",);
  });

  test("throws for an unknown cross-origin-resource-policy value", () => {
    const cfg = defaults();
    (cfg.headers as unknown as Record<string, unknown>).crossOriginResourcePolicy = "same-site";
    expect(() => {
      validate(cfg,);
    },).toThrow("crossOriginResourcePolicy",);
  });

  test("accepts the null (unset) header policies", () => {
    const cfg = defaults();
    (cfg.headers as unknown as Record<string, unknown>).xFrameOptions = null;
    (cfg.headers as unknown as Record<string, unknown>).crossOriginOpenerPolicy = null;
    (cfg.headers as unknown as Record<string, unknown>).crossOriginEmbedderPolicy = null;
    (cfg.headers as unknown as Record<string, unknown>).crossOriginResourcePolicy = null;
    expect(() => {
      validate(cfg,);
    },).not.toThrow();
  });
});

describe("validate — ollamaNative target language", () => {
  test("throws for an ollamaNative provider without a model", () => {
    const cfg = defaults();
    cfg.generation.providers.ollamaNative = {
      name: "oll",
      label: "Ollama",
      model: "",
      baseUrl: "http://localhost:11434",
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: false,
      models: {},
    };

    expect(() => {
      validate(cfg,);
    },).toThrow("ollamaNative requires model",);
  });
});
