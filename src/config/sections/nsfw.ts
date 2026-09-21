// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/nsfw.ts — NSFW config section

import type { NsfwConfig, } from "../schema";

export const NSFW_DEFAULTS = {
  allowNsfw: true,
  nsfwMinAge: 18,
  defaultNsfwScope: "chat",
  consentRequired: true,
  auditLogging: true,
  piiSecret: "",
  reporterHashSecret: "",
  useLlmClassifier: true,
} satisfies NsfwConfig;

/** */
export class NsfwSection implements NsfwConfig {
  allowNsfw = NSFW_DEFAULTS.allowNsfw;
  nsfwMinAge = NSFW_DEFAULTS.nsfwMinAge;
  defaultNsfwScope = NSFW_DEFAULTS.defaultNsfwScope;
  consentRequired = NSFW_DEFAULTS.consentRequired;
  auditLogging = NSFW_DEFAULTS.auditLogging;
  piiSecret = NSFW_DEFAULTS.piiSecret;
  reporterHashSecret = NSFW_DEFAULTS.reporterHashSecret;
  useLlmClassifier = NSFW_DEFAULTS.useLlmClassifier;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<NsfwConfig>,) {
    Object.assign(this, overrides,);
  }
}

export const nsfwMeta = {
  type: "object" as const,
  description: "NSFW configuration",
  properties: {
    allowNsfw: { type: "boolean", default: NSFW_DEFAULTS.allowNsfw, description: "Allow NSFW content", },
    nsfwMinAge: {
      type: "integer",
      default: NSFW_DEFAULTS.nsfwMinAge,
      description: "Minimum age for NSFW content",
    },
    defaultNsfwScope: {
      type: "string",
      enum: ["chat", "user", "world",],
      default: NSFW_DEFAULTS.defaultNsfwScope,
      description: "Default NSFW scope for new chats",
    },
    consentRequired: {
      type: "boolean",
      default: NSFW_DEFAULTS.consentRequired,
      description: "Require consent before NSFW encounters",
    },
    auditLogging: {
      type: "boolean",
      default: NSFW_DEFAULTS.auditLogging,
      description: "Log NSFW gate decisions to audit trail",
    },
    piiSecret: {
      type: "string",
      default: NSFW_DEFAULTS.piiSecret,
      description: "HMAC secret for NSFW PII pseudonymization. Env-only: NSFW_PII_SECRET. Required in production.",
    },
    reporterHashSecret: {
      type: "string",
      default: NSFW_DEFAULTS.reporterHashSecret,
      description:
        "HMAC secret for moderation reporter-hash projection. Env-only: NSFW_FLAG_REPORTER_HASH_SECRET. Falls back to nsfw.piiSecret when unset.",
    },
    useLlmClassifier: {
      type: "boolean",
      default: NSFW_DEFAULTS.useLlmClassifier,
      description: "Augment NSFW keyword detection with an LLM content rating classifier",
    },
  },
  required: ["allowNsfw", "nsfwMinAge",] as const,
};
