// src/config/sections/assistant.ts — Assistant config section

import type { AssistantConfig, } from "../schema";

export const ASSISTANT_DEFAULTS = {
  enabled: true,
  travelPrompts: false,
} satisfies AssistantConfig;

export class AssistantSection implements AssistantConfig {
  enabled = ASSISTANT_DEFAULTS.enabled;
  travelPrompts = ASSISTANT_DEFAULTS.travelPrompts;

  constructor(overrides?: Partial<AssistantConfig>,) {
    Object.assign(this, overrides,);
  }
}

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
