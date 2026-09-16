// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat Variants — 12-variant canonical taxonomy.
 *
 * Sourced from `epic-chat-variants-taxonomy`. Every variant resolves to a
 * primary `(chat_type, chat_mode, chat_purpose)` triple plus auxiliary column
 * defaults (`max_turns`, `auto_advance`, `gm_config`, `talkativity`,
 * `prompt_override_default`).
 *
 * The frontend creation modal uses this table to map a single variant pick
 * into the full tuple of `(type, mode, purpose, ...)` defaults. The route
 * validator at `src/routes/chats/create.ts` accepts a `variant` field, looks
 * up `VARIANT_DEFAULTS[variant]`, and rejects submissions whose supplied
 * triple disagrees with the table.
 */

import { ChatMode, ChatPurpose, ChatType, } from "../../db/enums-core/users";

export type ChatVariant =
  | "assistant"
  | "assistant_group"
  | "user_1x1"
  | "user_group"
  | "user_group_admin"
  | "llm_only"
  | "llm_only_group"
  | "llm_only_group_gm"
  | "character"
  | "character_group"
  | "rpg"
  | "rpg_group";

export const CHAT_VARIANTS = [
  "assistant",
  "assistant_group",
  "user_1x1",
  "user_group",
  "user_group_admin",
  "llm_only",
  "llm_only_group",
  "llm_only_group_gm",
  "character",
  "character_group",
  "rpg",
  "rpg_group",
] as const satisfies readonly ChatVariant[];

export type GmConfig =
  | { moderation: { slow_mode_ms?: number; pinned?: string[]; lock?: boolean } }
  | { validation: { harness: string; expected_outputs?: string[]; scoring?: string } }
  | { gm_profile: { kind: "llm" | "user" | "hybrid"; persona_ref?: string; autonomy_level?: number } }
  | { cast: string[]; director?: string }
  | {
    gm_profile: { kind: "llm" | "user" | "hybrid"; persona_ref?: string; autonomy_level?: number };
    rpg_party: string[];
    party_size: number;
  }
  | null;

export interface VariantDefaults {
  chat_type: ChatType;
  chat_mode: ChatMode;
  chat_purpose: ChatPurpose;
  max_turns: number | null;
  auto_advance: 0 | 1;
  gm_config: GmConfig;
  talkativity: number | null;
  prompt_override_default: string | null;
}

export const VARIANT_DEFAULTS: Record<ChatVariant, VariantDefaults> = {
  // 1. assistant chat
  assistant: {
    chat_type: ChatType.Direct,
    chat_mode: ChatMode.Story,
    chat_purpose: ChatPurpose.Assistant,
    max_turns: null,
    auto_advance: 0,
    gm_config: null,
    talkativity: 5,
    prompt_override_default: null,
  },
  // 2. assistant group chat
  assistant_group: {
    chat_type: ChatType.Group,
    chat_mode: ChatMode.Story,
    chat_purpose: ChatPurpose.Assistant,
    max_turns: null,
    auto_advance: 0,
    gm_config: null,
    talkativity: 4,
    prompt_override_default: null,
  },
  // 3. user chat 1x1
  user_1x1: {
    chat_type: ChatType.Direct,
    chat_mode: ChatMode.Story,
    chat_purpose: ChatPurpose.Social,
    max_turns: null,
    auto_advance: 0,
    gm_config: null,
    talkativity: 5,
    prompt_override_default: null,
  },
  // 4. user group chat
  user_group: {
    chat_type: ChatType.Group,
    chat_mode: ChatMode.Story,
    chat_purpose: ChatPurpose.Social,
    max_turns: null,
    auto_advance: 0,
    gm_config: null,
    talkativity: 5,
    prompt_override_default: null,
  },
  // 5. user group chat with admin
  user_group_admin: {
    chat_type: ChatType.Group,
    chat_mode: ChatMode.Story,
    chat_purpose: ChatPurpose.Social,
    max_turns: null,
    auto_advance: 0,
    gm_config: { moderation: {}, },
    talkativity: 5,
    prompt_override_default: null,
  },
  // 6. llm-only chat
  llm_only: {
    chat_type: ChatType.Direct,
    chat_mode: ChatMode.Battle,
    chat_purpose: ChatPurpose.Validation,
    max_turns: 50,
    auto_advance: 1,
    gm_config: { validation: { harness: "", }, },
    talkativity: 8,
    prompt_override_default: "",
  },
  // 7. llm-only group chat
  llm_only_group: {
    chat_type: ChatType.Group,
    chat_mode: ChatMode.Battle,
    chat_purpose: ChatPurpose.Validation,
    max_turns: 50,
    auto_advance: 1,
    gm_config: { validation: { harness: "", }, },
    talkativity: 7,
    prompt_override_default: "",
  },
  // 8. llm-only group + gm
  llm_only_group_gm: {
    chat_type: ChatType.Group,
    chat_mode: ChatMode.Story,
    chat_purpose: ChatPurpose.Guided,
    max_turns: null,
    auto_advance: 0,
    gm_config: { gm_profile: { kind: "llm", }, },
    talkativity: 6,
    prompt_override_default: null,
  },
  // 9. chat with character
  character: {
    chat_type: ChatType.Direct,
    chat_mode: ChatMode.Story,
    chat_purpose: ChatPurpose.Roleplay,
    max_turns: null,
    auto_advance: 0,
    gm_config: null,
    talkativity: 7,
    prompt_override_default: null,
  },
  // 10. group chat multi-character
  character_group: {
    chat_type: ChatType.Group,
    chat_mode: ChatMode.Story,
    chat_purpose: ChatPurpose.Roleplay,
    max_turns: null,
    auto_advance: 0,
    gm_config: { cast: [], },
    talkativity: 6,
    prompt_override_default: null,
  },
  // 11. rpg chat
  rpg: {
    chat_type: ChatType.Direct,
    chat_mode: ChatMode.Story,
    chat_purpose: ChatPurpose.Rpg,
    max_turns: null,
    auto_advance: 0,
    gm_config: { gm_profile: { kind: "llm", }, },
    talkativity: 6,
    prompt_override_default: null,
  },
  // 12. rpg group chat
  rpg_group: {
    chat_type: ChatType.Group,
    chat_mode: ChatMode.Battle,
    chat_purpose: ChatPurpose.Rpg,
    max_turns: null,
    auto_advance: 1,
    gm_config: { gm_profile: { kind: "llm", }, rpg_party: [], party_size: 1, },
    talkativity: 5,
    prompt_override_default: null,
  },
};

/**
 * Look up the defaults for a variant, returning `undefined` if unknown.
 */
export function getVariantDefaults(variant: string,): VariantDefaults | undefined {
  return (VARIANT_DEFAULTS as Record<string, VariantDefaults | undefined>)[variant];
}

/**
 * Validate that a supplied `(chat_type, chat_mode, chat_purpose)` triple
 * matches what the variant table declares. Returns `null` on success, or
 * a human-readable error string on mismatch.
 */
export function validateVariantTriple(
  variant: ChatVariant,
  type: string,
  mode: string,
  purpose: string,
): string | null {
  const def = VARIANT_DEFAULTS[variant];
  if (!def) { return `Unknown variant: ${variant}`; }
  if (def.chat_type !== type) {
    return `Variant "${variant}" expects chat_type="${def.chat_type}", got "${type}"`;
  }
  if (def.chat_mode !== mode) {
    return `Variant "${variant}" expects chat_mode="${def.chat_mode}", got "${mode}"`;
  }
  if (def.chat_purpose !== purpose) {
    return `Variant "${variant}" expects chat_purpose="${def.chat_purpose}", got "${purpose}"`;
  }
  return null;
}
