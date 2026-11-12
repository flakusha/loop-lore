// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/command-parser.ts
//
// Parses slash commands from user input.
// Commands start with / and may have space-separated arguments.
//
// Example: "/roll 2d6+3 hello" → { command: "roll", args: ["2d6+3", "hello"], raw: "/roll 2d6+3 hello" }
//
// Named arguments (TASK-named-arguments-for-slash-commands):
//   "--key value"        → named.key = "value"
//   "--key=value"        → named.key = "value"
//   "--key "quoted text"" → named.key = "quoted text" (quotes group words)
//   "--flag"             → named.flag = ""
// Named keys require the `--` prefix: a non-flag token containing "=" stays
// positional, so dice notation and free-text hypotheticals never parse as
// arguments. `args` keeps EVERY token (flags included) so handlers that
// scan the raw list keep working; `positional` excludes flags and their
// consumed values.

import { getLogger, type Logger, } from "../logger";

/**
 * Lazy logger — only resolved when first used.
 * @returns a child logger namespaced for the `command-parser` module.
 */
const getLog = (): Logger => getLogger().child({ module: "command-parser", },);

/** Parsed slash command result */
export interface ParsedCommand {
  /** Command name without the leading slash (e.g., "roll") */
  command: string;
  /** Space-separated arguments (e.g., ["2d6+3"] for "/roll 2d6+3") */
  args: string[];
  /** Arguments with named flags and their consumed values removed */
  positional: string[];
  /** Named arguments: `--key value` / `--key=value` / `--flag` → "" */
  named: Record<string, string>;
  /** Original raw input string */
  raw: string;
}

/** A raw argument token and whether it was quote-grouped. */
interface ArgToken {
  text: string;
  quoted: boolean;
}

/** Matches a leading flag: `--key`, optionally `--key=value`. */
const FLAG = /^--([^=\s]+)=(.*)$/s;
/** Matches a bare flag with no value part. */
const BARE_FLAG = /^--([^=\s]+)$/;

/**
 * Strip one layer of matching surrounding quotes from a flag value.
 * @param value - Raw value after `=`
 * @returns the unquoted value
 */
function unquoteFlagValue(value: string,): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1,);
    }
  }

  return value;
}

/**
 * Tokenize the raw argument string: whitespace separates tokens; double or
 * single quotes group words into one token (the quote characters are
 * stripped). Quotes may also appear mid-word (`--style="a b"`) — they are
 * kept verbatim in the token text there and unquoted by the flag parser.
 * An unterminated quote consumes the rest of the input.
 * @param raw - Argument string after the command word
 * @returns tokens in order of appearance
 */
function tokenizeArgs(raw: string,): ArgToken[] {
  const tokens: ArgToken[] = [];
  let idx = 0;
  while (idx < raw.length) {
    const ch = raw[idx];
    if (/\s/.test(ch ?? "",)) {
      idx++;
      continue;
    }

    const quote = ch === '"' || ch === "'" ? ch : undefined;
    const start = idx++;
    if (quote !== undefined) {
      const end = raw.indexOf(quote, idx,);
      const stop = end === -1 ? raw.length : end;
      tokens.push({ text: raw.slice(idx, stop,), quoted: true, },);
      idx = stop + 1;
      continue;
    }

    while (idx < raw.length && !/\s/.test(raw[idx] ?? "",)) {
      // A quote inside a word stays part of the token; skip to its pair.
      const inner = raw[idx];
      if (inner === '"' || inner === "'") {
        const pair = raw.indexOf(inner, idx + 1,);
        idx = pair === -1 ? raw.length : pair + 1;
        continue;
      }

      idx++;
    }

    tokens.push({ text: raw.slice(start, idx,), quoted: false, },);
  }

  return tokens;
}

/**
 * Split tokens into the full arg list, positionals, and named flags.
 * A bare `--key` consumes the next token as its value unless that token
 * starts another flag; `--key=value` carries its own value.
 * @param tokens - Raw tokens in order
 * @returns full args, positional args, and the named map
 */
function classifyArgs(tokens: ArgToken[],): { args: string[]; positional: string[]; named: Record<string, string> } {
  const args: string[] = [];
  const positional: string[] = [];
  const named: Record<string, string> = {};

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) { break; }
    args.push(token.text,);
    if (token.quoted) {
      positional.push(token.text,);
      continue;
    }

    const withValue = FLAG.exec(token.text,);
    if (withValue !== null) {
      named[(withValue[1] ?? "").toLowerCase()] = unquoteFlagValue(withValue[2] ?? "",);
      continue;
    }

    const bare = BARE_FLAG.exec(token.text,);
    if (bare === null) {
      positional.push(token.text,);
      continue;
    }

    const key = (bare[1] ?? "").toLowerCase();
    const next = tokens[i + 1];
    const nextIsAnotherFlag = next !== undefined && next.text.startsWith("--",) && !next.quoted;
    if (next === undefined || nextIsAnotherFlag) {
      named[key] = "";
      continue;
    }

    named[key] = next.text;
    args.push(next.text,);
    i++;
  }

  return { args, positional, named, };
}

/**
 * Parse a slash command from user input.
 *
 * Returns null if the input does not start with "/" or has no command name.
 * @param input - User message text
 * @returns Parsed command or null
 */
export function parseCommand(input: string,): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/",) || trimmed.length < 2) { return null; }

  // Split on the first *any* whitespace character to separate command from
  // args: `indexOf(" ")` only recognised U+0020, so a tab-separated
  // `/roll<TAB>2d6` parsed the command as `roll<TAB>2d6` and never dispatched.
  const separator = /\s/.exec(trimmed,);
  const separatorIdx = separator?.index ?? -1;
  const command = (separatorIdx === -1 ? trimmed.slice(1,) : trimmed.slice(1, separatorIdx,)).toLowerCase();
  const rawArgs = separatorIdx === -1 ? "" : trimmed.slice(separatorIdx + 1,);
  const { args, positional, named, } = classifyArgs(tokenizeArgs(rawArgs,),);

  if (!command) { return null; }

  getLog().trace("Parsed command", { command, args, named, },);
  return { command, args, positional, named, raw: trimmed, };
}
