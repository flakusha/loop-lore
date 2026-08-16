// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character card `extensions` object — multi-level data for
 * plugin/game-rule content, stats, inventory, relationships,
 * world modifiers, feature flags, and translations.
 */
export const extensionsProperties = {
  type: "object",
  description: "Multi-level object descriptions for plugin/game-rule data. Any additional structured data lives here.",
  properties: {
    stats: {
      type: "object",
      additionalProperties: { type: "number", },
      description: "Genre-specific stat blocks",
    },
    inventory: {
      type: "array",
      description: "Character inventory items",
      items: {
        type: "object",
        properties: {
          id: { type: "string", },
          name: { type: "string", },
          type: { type: "string", },
          description: { type: "string", },
          quantity: { type: "number", "minimum": 0, },
          equipped: { type: "boolean", },
          metadata: { type: "object", additionalProperties: true, },
        },
      },
    },
    relationships: {
      type: "array",
      description: "Inter-character relationships",
      items: {
        type: "object",
        properties: {
          target_character_id: { type: "string", },
          type: {
            type: "string",
            enum: [
              "friend",
              "rival",
              "ally",
              "enemy",
              "family",
              "mentor",
              "student",
              "neutral",
            ],
          },
          strength: {
            type: "number",
            "minimum": 0,
            "maximum": 100,
          },
          notes: { type: "string", },
        },
      },
    },
    world_modifiers: {
      type: "array",
      description: "World/location-specific behavioral modifiers",
      items: {
        type: "object",
        properties: {
          world_id: { type: "string", },
          type: {
            type: "string",
            enum: [
              "speech",
              "behavior",
              "emotional",
              "social",
              "quirk_suppression",
            ],
          },
          description: { type: "string", },
          active: { type: "boolean", },
        },
      },
    },
    plugin_bundle: {
      type: "string",
      description: "Reference to a plugin bundle ID",
    },
    feature_flags: {
      type: "object",
      description: "Opt-in feature flags",
      properties: {
        rpg_mechanics: { type: "boolean", },
        inventory: { type: "boolean", },
        relationships: { type: "boolean", },
        mood: { type: "boolean", },
        traits: { type: "boolean", },
        lorebook: { type: "boolean", },
        assets: { type: "boolean", },
        nsfw: { type: "boolean", },
      },
      additionalProperties: false,
    },
    translations: {
      type: "object",
      description: "Multi-language translations for text fields",
      additionalProperties: {
        type: "object",
        properties: {
          name: { type: "string", },
          description: { type: "string", },
          personality: { type: "string", },
          scenario: { type: "string", },
          welcome_message: { type: "string", },
          mes_example: { type: "string", },
          system_prompt: { type: "string", },
          post_history_instructions: { type: "string", },
          alternate_greetings: {
            type: "array",
            items: { type: "string", },
          },
          creator_notes: { type: "string", },
        },
      },
    },
  },
  additionalProperties: true,
} as const;
