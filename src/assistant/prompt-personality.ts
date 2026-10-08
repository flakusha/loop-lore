// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Prompt assembler — assistant personality resolution (split from prompt-assembler.ts). */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { composePersonalityBlock, resolvePersonalityState, } from "./personality/composer";
import type { AssembleChat, PromptParams, } from "./prompt/types";

/**
 * Attach the composed assistant-personality block to the prompt params when
 * the caller did not supply one explicitly.
 *
 * The `assistantPersonality` section fires only when `params.assistantPersonality`
 * is set, so this wires the chat's `gm_config.assistantPersonality` binding into
 * the prompt. Best-effort, like the mood/outfit lookups: a malformed binding or
 * missing actor leaves the prompt unchanged.
 * @param db
 * @param params - Prompt params to enrich
 * @param chat - Assembled chat projection (carries the raw `gm_config` blob)
 * @returns the params with `assistantPersonality` when a voice resolves, else
 *   the params unchanged.
 */
export async function withResolvedPersonality(
  db: Kysely<DB>,
  params: PromptParams,
  chat: AssembleChat,
): Promise<PromptParams> {
  if (params.assistantPersonality !== undefined) { return params; }

  try {
    const state = resolvePersonalityState(chat.id, chat.gm_config,);
    const block = await composePersonalityBlock(db, state,);
    return block ? { ...params, assistantPersonality: block, } : params;
  } catch (error) {
    getLogger().debug("prompt-assembler: personality lookup failed, skipping personality injection", { err: error, },);
    return params;
  }
}
