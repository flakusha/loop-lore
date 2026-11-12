// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pipe operator for slash commands (TASK-pipe-operator-chaining-slash-commands)
 * — `cmd1 | cmd2` chains where each stage's emitted text feeds the next
 * stage's `{{pipe}}` macro (SillyTavern piping pattern).
 *
 * Cycles are structurally impossible: a chain is a linear list resolved
 * once, left to right; command handlers cannot invoke commands, and macro
 * values are never re-scanned (`expandMacros` literal mode), so a pipe value
 * cannot smuggle in a new `|` split or another `{{pipe}}` expansion. The
 * only guard needed is a depth cap on chain length.
 *
 * Closures and loops are explicitly out of scope — the workflow-runner owns
 * multi-step server-side composition.
 */

import type { CommandResult, } from "./registry";

/** Maximum stages in one pipe chain. */
export const MAX_PIPE_STAGES = 8;

/** What a command may emit into the next stage's `{{pipe}}`. */
export type PipeEmit = { kind: "text"; text: string } | { kind: "none" };

/** Construct a text emit. */
export function pipeText(text: string,): PipeEmit {
  return { kind: "text", text, };
}

/** Construct the empty emit. */
export function pipeNone(): PipeEmit {
  return { kind: "none", };
}

/**
 * The text a command result hands to the next pipe stage. An explicit
 * `result.pipe` wins; otherwise the system message pipes through (an empty
 * result pipes the empty string).
 * @param result - The completed stage's result
 * @returns the text for the next stage's `{{pipe}}` macro
 */
export function pipeTextOf(result: CommandResult,): string {
  if (result.pipe !== undefined) {
    return result.pipe.kind === "text" ? result.pipe.text : "";
  }

  return result.systemMessage ?? "";
}

/**
 * Split a pipe chain on top-level `|` separators. Quote-grouped sections
 * (`"a | b"`) stay inside one segment, and a backslash-escaped `\|` stays
 * literal in its segment. Segment boundaries are author intent only — this
 * runs BEFORE macro expansion, so a macro value can never open a new stage.
 * @param input - Raw user content (already mention-stripped)
 * @returns the segments, in order (may be empty strings — caller validates)
 */
export function splitPipeChain(input: string,): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: string | undefined;
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      current += "\\" + ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (quote !== undefined) {
      current += ch;
      if (ch === quote) { quote = undefined; }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === "|") {
      segments.push(current,);
      current = "";
      continue;
    }

    current += ch;
  }

  if (escaped) { current += "\\"; }
  segments.push(current,);
  return segments;
}
