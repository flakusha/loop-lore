// src/config/sections/characters.ts — Character template config section
//
// Default characters created on app start from config templates.
// Templates NEVER override existing DB records (idempotent seeding).

import type { CharactersConfig, } from "../schema";

export interface CharacterTemplate {
  /** Display name (required) */
  name: string;
  /** Character description (required) */
  description: string;
  /** Personality traits */
  personality?: string;
  /** RP scenario/setting */
  scenario?: string;
  /** Welcome message */
  welcome_message?: string;
  /** System prompt override */
  system_prompt?: string;
  /** Example dialogue */
  mes_example?: string;
  /** Tags for classification */
  tags?: string[];
  /** Creator attribution */
  creator?: string;
}

export const CHARACTERS_DEFAULTS = {
  enabled: true,
  templates: [],
} satisfies CharactersConfig;

export class CharactersSection implements CharactersConfig {
  enabled = CHARACTERS_DEFAULTS.enabled;
  templates: CharacterTemplate[] = CHARACTERS_DEFAULTS.templates;

  constructor(overrides?: Partial<CharactersConfig>,) {
    Object.assign(this, overrides,);
  }
}

export const charactersMeta = {
  type: "object" as const,
  description: "Character template configuration — default characters seeded on app start",
  properties: {
    enabled: {
      type: "boolean",
      default: CHARACTERS_DEFAULTS.enabled,
      description: "Enable character template seeding",
    },
    templates: {
      type: "array",
      description: "Default character templates to seed on first start",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Character display name", },
          description: { type: "string", description: "Character description", },
          personality: { type: "string", description: "Personality traits", },
          scenario: { type: "string", description: "RP scenario/setting", },
          welcome_message: { type: "string", description: "Welcome message", },
          system_prompt: { type: "string", description: "System prompt override", },
          mes_example: { type: "string", description: "Example dialogue", },
          tags: { type: "array", items: { type: "string", }, description: "Classification tags", },
          creator: { type: "string", description: "Creator attribution", },
        },
        required: ["name", "description",],
      },
    },
  },
  required: ["enabled", "templates",] as const,
};
