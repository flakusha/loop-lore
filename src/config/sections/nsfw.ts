// src/config/sections/nsfw.ts — NSFW config section

import type { NsfwConfig, } from "../schema";

export const NSFW_DEFAULTS = {
  allowNsfw: true,
  nsfwMinAge: 18,
  defaultNsfwScope: "chat",
  consentRequired: true,
  auditLogging: true,
} satisfies NsfwConfig;

export class NsfwSection implements NsfwConfig {
  allowNsfw = NSFW_DEFAULTS.allowNsfw;
  nsfwMinAge = NSFW_DEFAULTS.nsfwMinAge;
  defaultNsfwScope = NSFW_DEFAULTS.defaultNsfwScope;
  consentRequired = NSFW_DEFAULTS.consentRequired;
  auditLogging = NSFW_DEFAULTS.auditLogging;

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
  },
  required: ["allowNsfw", "nsfwMinAge",] as const,
};
