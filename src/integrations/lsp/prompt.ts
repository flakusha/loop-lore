// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Read-only completion prompt: the directive, the cursor-centred document
 * window, and nothing else (no repo reads here — the client sends the
 * document text).
 */

import { WRITE_OR_EXEC_TOOL_KINDS, } from "../harness/permission-policy";

/** Widest document window a completion prompt carries (chars, cursor-centred). */
// ponytail: naive char cap, not token-aware; per-language chunking if prompts bloat.
export const COMPLETION_CONTEXT_LIMIT = 16_000;

/**
 * The read-only directive every completion prompt carries: the agent must
 * answer with completion text only, so its tool calls (if any) classify as
 * read-only and `classifyPermission` stays on auto-allow — never write,
 * never exec on the completion path.
 */
export const COMPLETION_READ_ONLY_DIRECTIVE = [
  "READ-ONLY COMPLETION: reply with ONLY the code/text that completes the cursor position.",
  "Do NOT edit files, run commands, or call write/execute tools — read-only context only.",
  `Write/exec tool kinds (${WRITE_OR_EXEC_TOOL_KINDS.join(", ",)}) are never approved on this path.`,
].join("\n",);

/** Input for {@link buildCompletionPrompt}. */
export interface CompletionPromptInput {
  uri: string;
  languageId: string;
  text: string;
  line: number;
  character: number;
}

/**
 * Build the read-only completion prompt for one cursor position: the
 * directive, the cursor-centred document window, and nothing else (no repo
 * reads here — the client sends the document text).
 * @param input - document uri, language, text, and cursor
 * @returns the prompt `dispatchHarnessTurn` runs
 */
export function buildCompletionPrompt(input: CompletionPromptInput,): string {
  const lines = input.text.split("\n",);
  const line = Math.max(0, Math.min(input.line, Math.max(0, lines.length - 1,),),);
  const character = Math.max(0, Math.min(input.character, (lines[line] ?? "").length,),);

  let offset = 0;
  for (let i = 0; i < line; i++) { offset += (lines[i] ?? "").length + 1; }
  offset += character;

  // Cursor-centred window: most context wants to be *before* the cursor.
  const windowText = input.text.length > COMPLETION_CONTEXT_LIMIT
    ? input.text.slice(Math.max(0, offset - 12_000,), Math.min(input.text.length, offset + 4_000,),)
    : input.text;

  const truncated = windowText.length !== input.text.length ? " (truncated to the cursor window)" : "";

  return [
    COMPLETION_READ_ONLY_DIRECTIVE,
    "",
    `File: ${input.uri} (${input.languageId})${truncated}`,
    `Cursor: line ${line}, character ${character}`,
    "Context:",
    windowText,
    "",
    "Completion:",
  ].join("\n",);
}
