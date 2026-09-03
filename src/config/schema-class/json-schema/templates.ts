// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/templates.ts — templates JSON Schema section
//
// Mirrors `TEMPLATES_DEFAULTS` in src/config/sections/templates.ts. Kept as a
// hand-written schema (vs. an auto-generated `*Meta`) because the templates
// section lives outside `sections/` and has no orchestrator-managed metadata.

const outfit = {
  type: "object" as const,
  properties: {
    id: { type: "string", description: "Stable outfit id referenced by loadouts and selection ladder", },
    name: { type: "string", description: "Human-readable label shown in UI", },
    descriptor: {
      type: "string",
      description: "Prompt-fragment fed to the avatar generator (identity-anchor + outfit-descriptor + emotion-descriptor)",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Free-form tags (formal|armor|sleepwear|swim|...) used by binding rules",
    },
  },
  required: ["id", "name", "descriptor",] as const,
};

const loadout = {
  type: "object" as const,
  properties: {
    name: { type: "string", description: "Symbolic name for the loadout rule", },
    slot: { type: "string", description: "Inventory slot key (e.g. chest, legs, head)", },
    item_match: { type: "string", description: "Substring match against equipped item id/name", },
    outfit: { type: "string", description: "Outfit id (from outfits[]) to switch into", },
  },
  required: ["name", "slot", "item_match", "outfit",] as const,
};

const mergeStrategy = {
  type: "string" as const,
  enum: ["replace", "extend", "override",],
  default: "extend",
  description: "Per-domain merge strategy for user overrides",
};

export const templates = {
  type: "object" as const,
  description: "Template configuration — LLM prompts, SD profiles, avatar emotions, image-edit workflows, character seeds",
  properties: {
    llm: {
      type: "object",
      properties: {
        merge: mergeStrategy,
        systemPrompts: {
          type: "object",
          description: "System prompt overrides keyed by canonical name",
          additionalProperties: { type: "string" },
        },
        chatFormats: {
          type: "object",
          description: "Chat format templates keyed by format id",
          additionalProperties: {
            type: "object",
            properties: {
              system: { type: "string" },
              user: { type: "string" },
              assistant: { type: "string" },
            },
            required: ["system", "user", "assistant",],
          },
        },
      },
      required: ["merge", "systemPrompts", "chatFormats",] as const,
    },
    sd: {
      type: "object",
      properties: {
        merge: mergeStrategy,
        profiles: {
          type: "object",
          description: "SD profile overrides keyed by profile id",
          additionalProperties: { type: "object" },
        },
        modelMatching: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pattern: { type: "string" },
              profileId: { type: "string" },
            },
            required: ["pattern", "profileId",],
          },
        },
      },
      required: ["merge", "profiles", "modelMatching",] as const,
    },
    avatar: {
      type: "object",
      properties: {
        merge: mergeStrategy,
        emotions: {
          type: "object",
          description: "Emotion key -> asset mapping",
          additionalProperties: {
            type: "object",
            properties: {
              asset: { type: "string" },
              intent: { type: "string" },
              prompt: { type: "string" },
            },
            required: ["asset", "intent",],
          },
        },
        intentPatterns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pattern: { type: "string" },
              emotion: { type: "string" },
            },
            required: ["pattern", "emotion",],
          },
        },
      },
      required: ["merge", "emotions", "intentPatterns",] as const,
    },
    imageEdit: {
      type: "object",
      properties: {
        merge: mergeStrategy,
        workflows: {
          type: "object",
          description: "Image-edit workflow overrides keyed by workflow id",
          additionalProperties: { type: "object" },
        },
      },
      required: ["merge", "workflows",] as const,
    },
    character: {
      type: "object",
      description: "Character template seeding — defaults loaded from configs/templates/character.yaml",
      properties: {
        merge: mergeStrategy,
        templates: {
          type: "array",
          description: "Character templates seeded on first start",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Hard ID for deterministic test reseeding" },
              name: { type: "string", description: "Character display name" },
              description: { type: "string", description: "Character description" },
              personality: { type: "string" },
              scenario: { type: "string" },
              welcome_message: { type: "string" },
              system_prompt: { type: "string" },
              mes_example: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              creator: { type: "string" },
              visibility: { type: "string", enum: ["private", "public",] },
              content_rating: {
                type: "string",
                enum: ["sfw", "nsfw_mild", "nsfw_moderate", "nsfw_intense", "nsfw_extreme",],
              },
              target_roles: {
                type: "array",
                items: { type: "string", enum: ["admin", "user", "viewer", "solo",] },
              },
              is_template: { type: "boolean" },
              is_default: { type: "boolean" },
              default_outfit: { type: "string", description: "Default outfit id used when no context binding fires" },
              outfits: { type: "array", items: outfit },
              loadouts: { type: "array", items: loadout },
            },
            required: ["name", "description",] as const,
          },
        },
      },
      required: ["merge", "templates",] as const,
    },
  },
  required: [
    "llm",
    "sd",
    "avatar",
    "imageEdit",
    "character",
  ] as const,
};