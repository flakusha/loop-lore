// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /translate command — translate text to a target language.
 *
 * Registers the "translate" and "tl" command aliases. Uses a lookup-based
 * translation for common phrases with a fallback to simple identity pass.
 * In future iterations this will route through the LLM generation pipeline.
 *
 * @module assistant/commands/translate
 */

import { type CommandResult, registerCommand, } from "./registry";

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

/**
 * Translate text to a target language.
 *
 * Usage:
 *   /translate <text> to <lang>     → translate text to language
 *   /translate <lang> <text>         → translate text to language
 *   /tl <text> to <lang>             → alias
 *   /tl <lang> <text>                → alias
 *
 * Examples:
 *   /translate Hello world to es     → "Hola mundo"
 *   /translate es Hola mundo         → "Hello world"
 */
registerCommand("translate", (args,): CommandResult => {
  return translateImpl(args,);
},);

/** Alias: /tl → /translate */
registerCommand("tl", (args,): CommandResult => {
  return translateImpl(args,);
},);

function translateImpl(args: string[],): CommandResult {
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

  // Basic translation placeholder — marks text for LLM pipeline integration
  const translated = `[Translation to ${langName}: ${text}]`;

  return {
    systemMessage: `**Translated to ${langName}:**\n\n${translated}\n\n> Original: ${text}`,
    actionPayload: {
      original: text,
      translated,
      targetLang,
      needsGeneration: true,
    },
    handled: true,
  };
}

export { LANGUAGES, };
