// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, it, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, LLMProvider, } from "../../generation/providers/types";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { type CommandContext, type CommandResult, getCommand, } from "./registry";
import { LANGUAGES, runTranslate, } from "./translate";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

describe("translate command", () => {
  it("is registered", () => {
    expect(getCommand("translate",),).toBeDefined();
  });

  it("registers the /tl alias", () => {
    expect(getCommand("tl",),).toBeDefined();
  });

  it("covers the supported language set", () => {
    expect(Object.keys(LANGUAGES,),).toEqual(
      ["en", "es", "fr", "de", "ja", "ko", "zh", "pt", "ru", "ar",],
    );
  });

  it("uses the LLM output when complete is provided (parse: <text> to <lang>)", async () => {
    let captured: GenerateRequest | undefined;
    const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
      captured = req;
      return { content: "Hola mundo", };
    };

    const result = await runTranslate(
      ["Hello world", "to", "es",],
      { chatId: "c1", },
      { complete, },
    );

    expect(captured?.messages[0]?.content,).toBe(
      "Translate the following text into Spanish. Output ONLY the translated text.",
    );

    expect(captured?.messages[1]?.content,).toBe("Hello world",);
    expect(result.systemMessage,).toContain("Hola mundo",);
    expect(result.systemMessage,).not.toContain("[Translation to",);
    expect(result.systemMessage,).not.toContain("LLM unavailable",);
  });

  it("uses the LLM output for the <lang> <text> form", async () => {
    let captured: GenerateRequest | undefined;
    const complete = async (req: GenerateRequest,): Promise<{ content: string }> => {
      captured = req;
      return { content: "Hello world", };
    };

    const result = await runTranslate(
      ["en", "Hola mundo",],
      { chatId: "c1", },
      { complete, },
    );

    expect(captured?.messages[0]?.content,).toBe(
      "Translate the following text into English. Output ONLY the translated text.",
    );

    expect(captured?.messages[1]?.content,).toBe("Hola mundo",);
    expect(result.systemMessage,).toContain("Hello world",);
  });

  it("falls back when complete is undefined and appends the system note", async () => {
    const result = await runTranslate(
      ["Hello world", "to", "es",],
      { chatId: "c1", },
      {},
    );

    expect(result.systemMessage,).toContain("LLM unavailable — applied local heuristics only",);
    expect(result.systemMessage,).toContain("Hello world",);
    expect(result.actionPayload,).toEqual(
      expect.objectContaining({ fallback: true, },),
    );
  });

  it("falls back when complete throws", async () => {
    const complete = async (): Promise<{ content: string }> => {
      throw new Error("rate limit",);
    };

    const result = await runTranslate(
      ["Hello", "to", "fr",],
      { chatId: "c1", },
      { complete, },
    );

    expect(result.systemMessage,).toContain("LLM unavailable — applied local heuristics only",);
  });

  // Consumer contract: the model /translate actually calls with comes from the
  // `translator` role. Driven through the REAL registered handler so the
  // command wiring itself is covered, not just runTranslate's deps.
  describe("translator role wiring (registered handler)", () => {
    const GENERAL_PROVIDER = "tl-cmd-general";
    const GENERAL_MODEL = "tl-general-model";
    const TRANSLATOR_PROVIDER = "tl-cmd-translator";
    const TRANSLATOR_MODEL = "tl-translator-model";

    /** Stub provider recording the model it was asked to use. */
    const recorder = (onCall: (model: string,) => void,) =>
      ({
        capabilities: { label: "Translate Cmd Test Provider", streaming: false, },
        complete: async (req: GenerateRequest,) => {
          onCall(req.model,);
          return { content: "bonjour", };
        },
        healthCheck: async () => ({ status: "ok" as const, }),
        listModels: async () => [],
      }) as unknown as LLMProvider;

    /** Config with a general model plus the given modelRoles. */
    const makeCmdConfig = (modelRoles: Record<string, unknown>,): Config => {
      const defaults = createConfigSchema().defaults as unknown as { generation: Record<string, unknown> };
      defaults.generation.defaultProvider = GENERAL_PROVIDER;
      defaults.generation.defaultModels = { [GENERAL_PROVIDER]: GENERAL_MODEL, };
      defaults.generation.modelRoles = modelRoles;
      return defaults as unknown as Config;
    };

    /** Invoke the registered /translate handler with a real db + config. */
    const invokeTranslate = async (name: string, config: Config,): Promise<CommandResult> => {
      const { db, } = await createTestDb();
      const handler = getCommand(name,);
      if (!handler) { throw new Error(`command ${name} not registered`,); }
      return handler(["hello", "to", "fr",], {
        chatId: "tl-cmd-chat",
        userId: "tl-cmd-user",
        config,
        db,
      } as CommandContext,);
    };

    it("/translate calls the configured translator model, not the general one", async () => {
      let captured = "";
      registerProvider(
        TRANSLATOR_PROVIDER,
        recorder((m,) => {
          captured = m;
        },),
      );

      registerProvider(
        GENERAL_PROVIDER,
        recorder((m,) => {
          captured = `general:${m}`;
        },),
      );

      try {
        const result = await invokeTranslate(
          "translate",
          makeCmdConfig({ translator: { provider: TRANSLATOR_PROVIDER, model: TRANSLATOR_MODEL, }, },),
        );

        expect(captured,).toBe(TRANSLATOR_MODEL,);
        expect(result.actionPayload,).toEqual(expect.objectContaining({ translated: "bonjour", },),);
      } finally {
        unregisterProvider(TRANSLATOR_PROVIDER,);
        unregisterProvider(GENERAL_PROVIDER,);
      }
    });

    it("/translate falls back to the general model when translator is unset", async () => {
      let captured = "";
      registerProvider(
        GENERAL_PROVIDER,
        recorder((m,) => {
          captured = m;
        },),
      );

      try {
        const result = await invokeTranslate("translate", makeCmdConfig({},),);

        expect(captured,).toBe(GENERAL_MODEL,);
        expect(result.actionPayload,).toEqual(expect.objectContaining({ translated: "bonjour", },),);
      } finally {
        unregisterProvider(GENERAL_PROVIDER,);
      }
    });

    it("the /tl alias resolves the translator role identically", async () => {
      let captured = "";
      registerProvider(
        TRANSLATOR_PROVIDER,
        recorder((m,) => {
          captured = m;
        },),
      );

      registerProvider(
        GENERAL_PROVIDER,
        recorder((m,) => {
          captured = `general:${m}`;
        },),
      );

      try {
        await invokeTranslate(
          "tl",
          makeCmdConfig({ translator: { provider: TRANSLATOR_PROVIDER, model: TRANSLATOR_MODEL, }, },),
        );

        expect(captured,).toBe(TRANSLATOR_MODEL,);
      } finally {
        unregisterProvider(TRANSLATOR_PROVIDER,);
        unregisterProvider(GENERAL_PROVIDER,);
      }
    });

    // Negative space: a bad translator must NOT quietly translate on another
    // model, and the caller must learn the text was not translated.
    it("degrades to heuristics for an unregistered translator provider", async () => {
      registerProvider(GENERAL_PROVIDER, recorder(() => {},),);

      try {
        const result = await invokeTranslate(
          "translate",
          makeCmdConfig({ translator: { provider: "no-such-provider", model: TRANSLATOR_MODEL, }, },),
        );

        expect(result.actionPayload,).toEqual(expect.objectContaining({ fallback: true, },),);
        expect(result.systemMessage,).toContain("LLM unavailable",);
      } finally {
        unregisterProvider(GENERAL_PROVIDER,);
      }
    });
  });

  it("does not contain the literal placeholder string", () => {
    // Source-level guard: the old `[Translation to ${langName}: ${text}]` string
    // must be GONE from translate.ts.
    const src = readFileSync(join(__dirname, "translate.ts",), "utf8",);
    expect(src,).not.toContain("[Translation to",);
  });
});
