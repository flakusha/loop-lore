// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Built-in macro registry for the slash-command path — the STscript-style
 * macros (`char`, `user`, `chat`, `last`, `pipe`) resolved from a
 * {@link CommandContext} plus the running pipe value.
 *
 * Pure: the registry holds lazy resolvers over data the dispatcher already
 * fetched; no DB access happens here.
 */

import type { CommandContext, } from "../commands/registry";
import type { MacroRegistry, } from "./engine";

/** Inputs for building the command-path macro registry. */
export interface CommandMacroInput {
  /** The dispatch context (character, chat, recent messages, caller). */
  ctx: CommandContext;
  /** Text emitted by the previous pipe stage; empty outside a pipe. */
  pipe?: string;
}

/**
 * Build the command-path macro registry. All values are lazy so a command
 * text that references no macro pays nothing.
 *
 * - `{{char}}` — active character display name (falls back to `name`, then "")
 * - `{{user}}` — calling user id (persona names are not resolved here)
 * - `{{chat}}` — active chat id
 * - `{{last}}` — last entry of `ctx.messages` (the dispatcher's most recent)
 * - `{{pipe}}` — previous pipe stage's emitted text ("" when absent)
 * @param input - Context and pipe text
 * @returns a macro registry for `expandMacros`
 */
export function commandMacroRegistry(input: CommandMacroInput,): MacroRegistry {
  const { ctx, pipe, } = input;
  return {
    char: () => ctx.currentCharacter?.display_name || ctx.currentCharacter?.name || "",
    user: () => ctx.userId ?? "",
    chat: () => ctx.activeChat?.id ?? "",
    last: () => {
      const messages = ctx.messages;
      if (!messages || messages.length === 0) { return ""; }
      return messages[messages.length - 1]?.content ?? "";
    },
    pipe: () => pipe ?? "",
  };
}
