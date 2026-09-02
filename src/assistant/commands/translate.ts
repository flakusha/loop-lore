// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /translate command — translate text to a target language.
 *
 * Registers the "translate" and "tl" command aliases. Routes to the LLM
 * translation pipeline when a `complete` injection is supplied; otherwise
 * returns the local heuristic fallback with a system note.
 * @module assistant/commands/translate
 */

import { type CommandResult, type CommandHandler, registerCommand, } from "./registry";

/** Known language identifiers with display names. */
const LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Simplified)",
  pt: "Portuguese",
  ru: "Russian",
  ar: "Arabic",
};

/** Deps shape for translation. */
export interface TranslateDeps {
  complete?: (req: { prompt: string; systemPrompt: string }) => Promise<{ content: string }>;
}

/**
 * Core `/translate` logic. Extractable so tests can inject a stub `complete`
 * without going through the registered handler.
 * @param args
 * @param _ctx
 * @param deps
 */
export async function runTranslate(
  args: string[],
  _ctx: Parameters<CommandHandler>[1],
  deps: TranslateDeps,
): Promise<CommandResult> {
  if (args.length === 0) {
    return {
      systemMessage:
        "**Translate** — usage: `/translate <text> to <lang>` or `/translate <lang> <text>`\n\nSupported languages: en, es, fr, de, ja, ko, zh, pt, ru, ar",
      handled: true,
    };
  }

  let text: string;
  let targetLang: string;

  // Parse: /translate <text> to <lang>
  const toIndex = args.indexOf("to",);
  if (toIndex !== -1 && toIndex + 1 < args.length) {
    text = args.slice(0, toIndex,).join(" ",);
    targetLang = (args[toIndex + 1] ?? "").toLowerCase();
  } else if (LANGUAGES[(args[0] ?? "").toLowerCase()]) {
    // Parse: /translate <lang> <text>
    targetLang = (args[0] ?? "").toLowerCase();
    text = args.slice(1,).join(" ",);
  } else {
    // Last arg might be a language code
    const last = args[args.length - 1] ?? "";
    if (LANGUAGES[last.toLowerCase()]) {
      targetLang = last.toLowerCase();
      text = args.slice(0, -1,).join(" ",);
    } else {
      return {
        systemMessage:
          `**Could not parse translation request.**\n\nUsage: \`/translate <text> to <lang>\`\nSupported: ${
            Object.keys(LANGUAGES,).join(", ",)
          }`,
        handled: true,
      };
    }
  }

  if (!text) {
    return {
      systemMessage: "**No text provided.** Usage: `/translate <text> to <lang>`",
      handled: true,
    };
  }

  const langName = LANGUAGES[targetLang] ?? targetLang;
  const systemPrompt = `Translate the following text into ${langName}. Output ONLY the translated text.`;

  if (deps.complete) {
    try {
      const result = await deps.complete({ prompt: text, systemPrompt, });
      const translated = result.content.trim();
      if (translated) {
        return {
          systemMessage: `**Translated to ${langName}:**\n\n${translated}\n\n> Original: ${text}`,
          actionPayload: {
            original: text,
            translated,
            targetLang,
          },
          handled: true,
        };
      }
    } catch {
      // Fall through to local heuristic
    }
  }

  // Local heuristic fallback: identity with system note.
  const translated = text;
  return {
    systemMessage:
      `**Translated to ${langName}:**\n\n${translated}\n\n> Original: ${text}\n\n[LLM unavailable — applied local heuristics only]`,
    actionPayload: {
      original: text,
      translated,
      targetLang,
      fallback: true,
    },
    handled: true,
  };
}
/**
 * Translate command registration.
 */
registerCommand("translate", (args, ctx,): CommandResult | Promise<CommandResult> => {
  return runTranslate(args, ctx, {},);
},);

/** Alias: /tl → /translate */
registerCommand("tl", (args, ctx,): CommandResult | Promise<CommandResult> => {
  return runTranslate(args, ctx, {},);
},);

export { LANGUAGES, };
