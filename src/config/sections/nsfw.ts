// src/config/sections/nsfw.ts — NSFW config section

import type { NsfwConfig } from "../schema";

export const NSFW_DEFAULTS = {
  allowNsfw: true,
  nsfwMinAge: 18,
} satisfies NsfwConfig;

export class NsfwSection implements NsfwConfig {
  allowNsfw = NSFW_DEFAULTS.allowNsfw;
  nsfwMinAge = NSFW_DEFAULTS.nsfwMinAge;

  constructor(overrides?: Partial<NsfwConfig>) {
    Object.assign(this, overrides);
  }
}

export const nsfwMeta = {
  type: "object" as const,
  description: "NSFW configuration",
  properties: {
    allowNsfw: { type: "boolean", default: NSFW_DEFAULTS.allowNsfw, description: "Allow NSFW content" },
    nsfwMinAge: {
      type: "integer",
      default: NSFW_DEFAULTS.nsfwMinAge,
      description: "Minimum age for NSFW content",
    },
  },
  required: ["allowNsfw", "nsfwMinAge"] as const,
};
