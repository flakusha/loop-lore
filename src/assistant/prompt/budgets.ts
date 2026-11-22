// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt-section budget resolution (1.0.0 THEME 4 AC5).
 *
 * Composes the global clamped `prompt.loreTokenBudget` /
 * `prompt.memoryTokenBudget` config with the per-world context-share
 * ratio (`worlds.prompt_budget_ratio`, migration 101):
 *
 *   effective = clamp(configBudget * worldRatio)
 *
 * Scale-then-clamp (see `effectivePromptBudget`): the global config stays
 * the hard ceiling and the world ratio scales within it. Worlds without a
 * ratio (or with a hand-edited out-of-bounds value) resolve neutral via
 * `clampPromptRatio`, so behavior is byte-identical to the config-only
 * baseline until a ratio is set.
 */
import type { Kysely, } from "kysely";
import { getConfigValue, } from "../../admin/config";
import { EDITABLE_SYSTEM_CONFIG_KEYS, } from "../../config/sections/menu-data";
import { effectivePromptBudget, } from "../../config/sections/prompt";
import type { DB, } from "../../db/schema";
import type { AssembleContext, } from "./types";

/** Prompt sections whose token budget honours the per-world ratio. */
export type BudgetSection = "lore" | "memory";

/**
 * Read the world's context-share ratio; neutral (1) when the chat has no
 * world or the row is missing.
 * @param db - request-scoped Kysely handle
 * @param worldId - chat's world, may be null (worldless chat)
 * @returns the stored ratio unvalidated — callers clamp via `effectivePromptBudget`
 * @throws {Error} when the worlds query fails
 */
export async function worldBudgetRatio(
  db: Kysely<DB>,
  worldId: string | null | undefined,
): Promise<number> {
  if (!worldId) { return 1; }
  const row = await db
    .selectFrom("worlds",)
    .select("prompt_budget_ratio",)
    .where("id", "=", worldId,)
    .executeTakeFirst();

  return row?.prompt_budget_ratio ?? 1;
}

/**
 * Resolve the effective token budget for one prompt section: the clamped
 * global config budget scaled by the chat's world context-share ratio.
 * @param ctx - assembly context (config + db + chat projection)
 * @param section - which budget to resolve
 * @returns the effective budget, always within the global bounds
 * @throws {Error} when the worlds query fails
 */
export async function resolveSectionBudget(
  ctx: Pick<AssembleContext, "db" | "chat" | "config">,
  section: BudgetSection,
): Promise<number> {
  const configured = section === "lore"
    ? ctx.config?.prompt?.loreTokenBudget
    : ctx.config?.prompt?.memoryTokenBudget;

  const key = section === "lore"
    ? EDITABLE_SYSTEM_CONFIG_KEYS.loreTokenBudget
    : EDITABLE_SYSTEM_CONFIG_KEYS.memoryTokenBudget;

  const stored = await getConfigValue(ctx.db, key,);
  const parsed = stored ? Number(stored,) : undefined;
  const base = parsed !== undefined && Number.isFinite(parsed,) ? parsed : configured;

  const ratio = await worldBudgetRatio(ctx.db, ctx.chat.world_id,);
  return effectivePromptBudget(base, ratio,);
}
