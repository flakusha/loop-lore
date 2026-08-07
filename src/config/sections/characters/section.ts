import type { CharactersConfig, } from "../../schema";
import { CHARACTERS_DEFAULTS, } from "./defaults.js";
import type { CharacterTemplate, } from "./types.js";

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
          id: { type: "string", description: "Hard ID for deterministic test reseeding", },
          name: { type: "string", description: "Character display name", },
          description: { type: "string", description: "Character description", },
          personality: { type: "string", description: "Personality traits", },
          scenario: { type: "string", description: "RP scenario/setting", },
          welcome_message: { type: "string", description: "Welcome message", },
          system_prompt: { type: "string", description: "System prompt override", },
          mes_example: { type: "string", description: "Example dialogue", },
          tags: { type: "array", items: { type: "string", }, description: "Classification tags", },
          creator: { type: "string", description: "Creator attribution", },
          species: { type: "string", description: "Identity — race/species trait (persisted as permanent trait)", },
          subrace: { type: "string", description: "Identity — subrace trait (persisted as permanent trait)", },
          gender: { type: "string", description: "Identity — gender trait (persisted as permanent trait)", },
          age: { type: ["string", "number",], description: "Identity — age trait (persisted as permanent trait)", },
          homeland: {
            type: "string",
            description: "Identity — origin/homeland background trait (persisted as permanent trait)",
          },
          culture: {
            type: "string",
            description: "Identity — culture background trait (persisted as permanent trait)",
          },
          avatar: {
            oneOf: [
              {
                type: "object",
                properties: { type: { const: "file", }, path: { type: "string", }, },
                required: ["type", "path",],
              },
              { type: "object", properties: { type: { const: "default", }, }, required: ["type",], },
            ],
            description: "Optional avatar for the seeded character",
          },
          visibility: {
            type: "string",
            enum: ["private", "public",],
            default: "public",
            description: "Visibility level",
          },
          content_rating: {
            type: "string",
            enum: ["sfw", "nsfw_mild", "nsfw_moderate", "nsfw_intense", "nsfw_extreme",],
            default: "sfw",
            description: "Content rating",
          },
          target_roles: {
            type: "array",
            items: { type: "string", enum: ["admin", "user", "viewer", "solo",], },
            default: ["user", "admin",],
            description: "User roles that can see/use this character",
          },
          is_template: {
            type: "boolean",
            default: false,
            description: "Can be used as template for user-created chars",
          },
          is_default: { type: "boolean", default: false, description: "Auto-add to new users' character list", },
        },
        required: ["name", "description",],
      },
    },
  },
  required: ["enabled", "templates",] as const,
};
