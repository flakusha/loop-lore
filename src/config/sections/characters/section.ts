// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { CharactersConfig, } from "../../schema";
import { CHARACTERS_DEFAULTS, } from "./defaults.js";
import type { CharacterTemplate, } from "./types.js";

/** */
export class CharactersSection implements CharactersConfig {
  enabled = CHARACTERS_DEFAULTS.enabled;
  templates: CharacterTemplate[] = CHARACTERS_DEFAULTS.templates;

  /**
   * @param overrides
   */
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
          // ── Wardrobe / outfits (epic-wardrobe-avatar-variants.md) ──
          // NOTE: under merge strategy "extend" (default for the character
          // domain), name collisions keep the BASE template; user overrides
          // for an existing character's wardrobe are silently dropped. To
          // add a wardrobe to a built-in character (Elara, ARIA-7, Morgan),
          // use strategy "override" in configs/templates/character.yaml.
          default_outfit: {
            type: "string",
            description: "Default outfit id used when no context binding fires",
          },
          outfits: {
            type: "array",
            description: "Wardrobe catalog — distinct (outfit_id) entries this character can wear",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Stable outfit id referenced by loadouts and selection ladder", },
                name: { type: "string", description: "Human-readable label shown in UI", },
                descriptor: {
                  type: "string",
                  description:
                    "Prompt-fragment fed to the avatar generator (identity-anchor + outfit-descriptor + emotion-descriptor)",
                },
                tags: {
                  type: "array",
                  items: { type: "string", },
                  description: "Free-form tags (formal|armor|sleepwear|swim|...) used by binding rules",
                },
              },
              required: ["id", "name", "descriptor",],
            },
          },
          loadouts: {
            type: "array",
            description: "Equipped-items → outfit mapping (deferred loadout-bridge phase)",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Symbolic name for the loadout rule", },
                slot: { type: "string", description: 'Inventory slot key (e.g. "chest", "legs", "head")', },
                item_match: { type: "string", description: "Substring match against equipped item id/name", },
                outfit: { type: "string", description: "Outfit id (from outfits[]) to switch into", },
              },
              required: ["name", "slot", "item_match", "outfit",],
            },
          },
        },
        required: ["name", "description",],
      },
    },
  },
  required: ["enabled", "templates",] as const,
};
