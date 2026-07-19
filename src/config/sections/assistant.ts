// src/config/sections/assistant.ts — Assistant config section

import type { AssistantConfig } from "../schema";

export const ASSISTANT_DEFAULTS = {
  enabled: true,
} satisfies AssistantConfig;

export class AssistantSection implements AssistantConfig {
  enabled = ASSISTANT_DEFAULTS.enabled;

  constructor(overrides?: Partial<AssistantConfig>) {
    Object.assign(this, overrides);
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
  },
  required: ["enabled"] as const,
};
