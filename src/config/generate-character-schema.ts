/**
 * Character Schema — JSON Schema generation
 *
 * Generates JSON Schema from the CanonicalCharacter type definition
 * for LSP/IDE support and validation.
 *
 * Usage: bun run src/config/generate-character-schema.ts
 * Outputs: schemas/character-card.schema.json
 */

import { writeFileSync, } from "node:fs";
import { dirname, } from "node:path";
import { fileURLToPath, } from "node:url";
import { createLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";

const __dirname = dirname(fileURLToPath(import.meta.url,),);
const log = createLogger({ level: "info", },);

export function characterJsonSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft-2020-12/schema",
    $id: "./schemas/character-card.schema.json",
    title: "Loop-Lore Character Card",
    description:
      "Canonical character card schema for loop-lore. Auto-generated from src/characters/spec.ts. Do not edit manually.",
    type: "object",
    required: ["name", "description", "personality",],
    properties: {
      spec: {
        type: "string",
        const: "loop-lore/v1",
        description: "Spec version identifier",
      },
      data: {
        type: "object",
        required: ["name", "description", "personality",],
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 64,
            description: "Character display name (required)",
          },
          description: {
            type: "string",
            minLength: 1,
            maxLength: 5000,
            description: "Full character description / backstory (required)",
          },
          personality: {
            type: "string",
            minLength: 1,
            maxLength: 2000,
            description: "Personality summary (immutable core)",
          },
          scenario: {
            type: "string",
            maxLength: 5000,
            description: "RP setting / context",
          },
          welcome_message: {
            type: "string",
            maxLength: 5000,
            description: "First message to user",
          },
          mes_example: {
            type: "string",
            maxLength: 10_000,
            description: "Example dialogue",
          },
          system_prompt: {
            type: "string",
            maxLength: 10_000,
            description: "System prompt override",
          },
          post_history_instructions: {
            type: "string",
            maxLength: 5000,
            description: "Instructions after chat history",
          },
          alternate_greetings: {
            type: "array",
            maxItems: 10,
            items: {
              type: "string",
              maxLength: 5000,
            },
            description: "Alternative welcome messages",
          },
          tags: {
            type: "array",
            maxItems: 20,
            items: {
              type: "string",
              maxLength: 32,
            },
            description: "Classification tags",
          },
          creator: {
            type: "string",
            maxLength: 64,
            description: "Creator name",
          },
          creator_notes: {
            type: "string",
            maxLength: 2000,
            description: "Creator notes",
          },
          character_version: {
            type: "string",
            maxLength: 16,
            description: "Creator's version string",
          },
          nickname: {
            oneOf: [
              { type: "string", maxLength: 64, },
              { type: "null", },
            ],
            description: "Alternative name",
          },
          content_rating: {
            type: "string",
            enum: [
              "sfw",
              "nsfw_mild",
              "nsfw_moderate",
              "nsfw_intense",
              "nsfw_extreme",
            ],
            default: "sfw",
            description: "Content classification",
          },
          nsfw_categories: {
            type: "array",
            maxItems: 50,
            items: { type: "string", },
            description: "Allowed NSFW categories",
          },
          nsfw_hard_limits: {
            type: "array",
            maxItems: 50,
            items: { type: "string", },
            description: "Never-allowed content",
          },
          lorebook: {
            type: "object",
            description: "Lorebook entries for context injection",
            properties: {
              name: { type: "string", },
              description: { type: "string", },
              scan_depth: { type: "integer", },
              token_budget: { type: "integer", },
              recursive_scanning: { type: "boolean", },
              entries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    keys: { type: "array", items: { type: "string", }, },
                    content: { type: "string", },
                    enabled: { type: "boolean", },
                    insertion_order: { type: "integer", },
                    case_sensitive: { type: "boolean", },
                    name: { type: "string", },
                    priority: { type: "integer", },
                    id: { type: "integer", },
                    comment: { type: "string", },
                    selective: { type: "boolean", },
                    constant: { type: "boolean", },
                    position: {
                      type: "string",
                      enum: ["before_char", "after_char",],
                    },
                    use_regex: { type: "boolean", },
                    extensions: { type: "object", additionalProperties: true, },
                  },
                },
              },
            },
          },
          assets: {
            type: "array",
            description: "Character assets (images, audio, video)",
            items: {
              type: "object",
              properties: {
                type: { type: "string", },
                name: { type: "string", },
                uri: { type: "string", },
                ext: { type: "string", },
              },
            },
          },
          extensions: {
            type: "object",
            description:
              "Multi-level object descriptions for plugin/game-rule data. Any additional structured data lives here.",
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
          },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };
}

function main() {
  const schema = characterJsonSchema();
  const outputPath = `${__dirname}/../../schemas/character-card.schema.json`;
  try {
    const r = safeJsonStringify(schema, 2,);
    writeFileSync(outputPath, r.ok ? r.value : "{}",);
    log.info(`Generated character schema: ${outputPath}`,);
  } catch (error) {
    log.fatal(`Failed to write schema: ${error instanceof Error ? error.message : String(error,)}`,);
    process.exit(1,);
  }
}

main();
