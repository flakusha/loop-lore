// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 102_worlds_prompt_budget_ratio
 *
 * Per-world context-share ratio for the prompt-assembly token budgets
 * (1.0.0 THEME 4 AC5). `worlds.prompt_budget_ratio` scales the configured
 * `prompt.loreTokenBudget` / `prompt.memoryTokenBudget` (global config,
 * clamped 128-8192) inside the lore and memories prompt sections:
 *
 *   effective = clamp(configBudget * prompt_budget_ratio)
 *
 * Default 1.0 keeps every existing world byte-identical; the read side
 * (`clampPromptRatio`) clamps defensively into [0.25, 4] so a hand-edited
 * row can never collapse or explode a prompt. The pre-existing absolute
 * `worlds.token_budget` lorebook column is a different knob and stays
 * unwired by prompt assembly.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("worlds",)
    .addColumn("prompt_budget_ratio", "real", (col,) => col.notNull().defaultTo(1,),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("worlds",)
    .dropColumn("prompt_budget_ratio",)
    .execute();
}
