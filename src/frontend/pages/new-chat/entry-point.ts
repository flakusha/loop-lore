// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Entry-point branches for the new-chat variant picker
 * (epic-chat-product-features, Chat Variants Taxonomy cross-cutting item).
 *
 * Origin surfaces link to `/views/new-chat?variant=<id>` (e.g. the Characters
 * tab preselects `character`); the page loader applies the param before the
 * variant sync runs, so type/mode disable and the world-required RPG state
 * match the preselection from the first render. The plain `/views/new-chat`
 * path carries no param and keeps the standard form.
 */

/** Query param naming the variant an entry-point link preselects. */
const VARIANT_PARAM = "variant";

/** The twelve canonical variants (epic-chat-variants-taxonomy). */
const CHAT_VARIANTS: Record<string, true> = {
  assistant: true,
  assistant_group: true,
  user_1x1: true,
  user_group: true,
  user_group_admin: true,
  llm_only: true,
  llm_only_group: true,
  llm_only_group_gm: true,
  character: true,
  character_group: true,
  rpg: true,
  rpg_group: true,
};

/**
 * Resolve the variant requested by an entry-point URL.
 * @param search - `location.search` of the new-chat page ("" on the plain path)
 * @returns the canonical variant id, or null when the param is absent, not a taxonomy variant, or "standard"
 */
export function readEntryVariant(search: string,): string | null {
  const param = new URLSearchParams(search,).get(VARIANT_PARAM,);
  return param !== null && CHAT_VARIANTS[param] === true ? param : null;
}

/**
 * Preselect the entry-point variant on the picker.
 * @param variantSelect - the `#chat-variant` select, when present
 * @param search - `location.search` of the new-chat page
 * @returns whether the picker was preselected
 */
export function applyEntryVariant(
  variantSelect: { value: string } | null,
  search: string,
): boolean {
  const variant = readEntryVariant(search,);
  if (variant === null || variantSelect === null) { return false; }
  variantSelect.value = variant;
  return true;
}
