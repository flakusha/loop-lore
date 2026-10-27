// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/assistant.ts — Assistant config section

/** Milliseconds per day — the default quota window. */
const DAY_MS = 24 * 60 * 60 * 1000;

export const ASSISTANT_QUOTA_DEFAULTS = {
  quotaWindowMs: DAY_MS,
  quotaLimitPerWindow: 200,
};

export const ASSISTANT_DEFAULTS = {
  enabled: true,
  travelPrompts: false,
  ...ASSISTANT_QUOTA_DEFAULTS,
};

/** */
export class AssistantSection {
  enabled = ASSISTANT_DEFAULTS.enabled;
  travelPrompts = ASSISTANT_DEFAULTS.travelPrompts;
  quotaWindowMs = ASSISTANT_QUOTA_DEFAULTS.quotaWindowMs;
  quotaLimitPerWindow = ASSISTANT_QUOTA_DEFAULTS.quotaLimitPerWindow;

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
    quotaWindowMs: {
      type: "integer",
      default: ASSISTANT_QUOTA_DEFAULTS.quotaWindowMs,
      description:
        "Assistant quota window length in ms: the fixed window per user over which expensive-command quota units are counted",
    },
    quotaLimitPerWindow: {
      type: "integer",
      default: ASSISTANT_QUOTA_DEFAULTS.quotaLimitPerWindow,
      description:
        "Assistant quota units available per user per window; expensive commands (rag, asset, duplicate, adapt, import, modify) deduct their cost pre-call",
    },
  },
  required: ["enabled",] as const,
};
