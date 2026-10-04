// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/assistant.ts — Assistant config section

export const ASSISTANT_DEFAULTS = {
  enabled: true,
  travelPrompts: false,
};

/** */
export class AssistantSection {
  enabled = ASSISTANT_DEFAULTS.enabled;
  travelPrompts = ASSISTANT_DEFAULTS.travelPrompts;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<AssistantSection>,) {
    Object.assign(this, overrides,);
  }
}

export type AssistantConfig = AssistantSection;

export const assistantMeta = {
  type: "object" as const,
  description: "Assistant configuration",
  properties: {
    enabled: {
      type: "boolean",
      default: ASSISTANT_DEFAULTS.enabled,
      description: "Enable rule-based assistant",
    },
    travelPrompts: {
      type: "boolean",
      default: ASSISTANT_DEFAULTS.travelPrompts,
      description:
        "Bound/linked travel mode: prompt the LLM to narrate travel and suggest moving the chat to another location/chat when the narrative leaves the current one",
    },
  },
  required: ["enabled",] as const,
};
