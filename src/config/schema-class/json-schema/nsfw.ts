// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/nsfw.ts — nsfw JSON Schema section
export const nsfw = {
  type: "object",
  description: "NSFW configuration",
  properties: {
    allowNsfw: { type: "boolean", default: true, description: "Allow NSFW content", },
    nsfwMinAge: { type: "integer", default: 18, description: "Minimum age for NSFW content", },
    defaultNsfwScope: { type: "string", enum: ["chat", "user", "world",], default: "chat", },
    consentRequired: { type: "boolean", default: true, },
    auditLogging: { type: "boolean", default: true, },
    useLlmClassifier: {
      type: "boolean",
      default: true,
      description:
        "Augment NSFW keyword detection with an LLM content rating classifier (on by default — the safety filter for extreme content)",
    },
  },
  required: ["allowNsfw", "nsfwMinAge",],
};
