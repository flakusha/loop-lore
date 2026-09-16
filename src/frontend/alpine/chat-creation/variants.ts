// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat creation variant picker — Alpine.js state slice.
 *
 * Twelve-option picker that emits the canonical
 * `(chat_type, chat_mode, chat_purpose)` triple plus auxiliary defaults
 * for the variant the user selected. The picker does NOT submit to the
 * API; modal integration is a follow-up ticket. This file is the
 * self-contained variant-broadcasting component.
 *
 * Bound via `data-state="chatVariantPicker"` and consumed by callers that
 * read `picker.selectedVariant` and `picker.triple()`.
 */

import {
  CHAT_VARIANTS,
  VARIANT_DEFAULTS,
  type ChatVariant,
  type VariantDefaults,
} from "../../../chat/types/variants";
import type { ChatMode, ChatPurpose, ChatType, } from "../../../db/enums-core/users";

export interface VariantPicker {
  pickerOpen: boolean;
  selectedVariant: ChatVariant | null;

  /** The full 12-option catalog rendered by the picker UI. */
  readonly variants: readonly ChatVariant[];

  openPicker(): void;
  closePicker(): void;
  selectVariant(variant: ChatVariant): void;
  /**
   * Resolve the canonical triple + auxiliary defaults for the picked
   * variant. Returns `null` until the user picks one. The returned object
   * is the shape that should populate the `chats` row.
   */
  triple(): {
    variant: ChatVariant;
    chat_type: ChatType;
    chat_mode: ChatMode;
    chat_purpose: ChatPurpose;
    max_turns: number | null;
    auto_advance: 0 | 1;
    gm_config: VariantDefaults["gm_config"];
    talkativity: number | null;
    prompt_override_default: string | null;
  } | null;
  /** Display label for a variant — used by the picker UI. */
  labelFor(variant: ChatVariant,): string;
}

const LABELS: Record<ChatVariant, string> = {
  assistant: "Assistant chat",
  assistant_group: "Assistant group chat",
  user_1x1: "User chat (1×1)",
  user_group: "User group chat",
  user_group_admin: "User group with admin",
  llm_only: "LLM-only validation chat",
  llm_only_group: "LLM-only group sandbox",
  llm_only_group_gm: "LLM group with GM (guided story)",
  character: "Character chat (1×1 RP)",
  character_group: "Multi-character group RP",
  rpg: "RPG chat",
  rpg_group: "RPG party group chat",
};

export const variantPicker: VariantPicker = {
  pickerOpen: false,
  selectedVariant: null,
  variants: CHAT_VARIANTS,

  openPicker() { this.pickerOpen = true; },
  closePicker() { this.pickerOpen = false; },
  selectVariant(variant) { this.selectedVariant = variant; },
  triple() {
    if (!this.selectedVariant) { return null; }
    const d = VARIANT_DEFAULTS[this.selectedVariant];
    return {
      variant: this.selectedVariant,
      chat_type: d.chat_type,
      chat_mode: d.chat_mode,
      chat_purpose: d.chat_purpose,
      max_turns: d.max_turns,
      auto_advance: d.auto_advance,
      gm_config: d.gm_config,
      talkativity: d.talkativity,
      prompt_override_default: d.prompt_override_default,
    };
  },
  labelFor(variant) { return LABELS[variant]; },
};
