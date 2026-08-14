/**
 * Core character card data fields (everything except `extensions`).
 */
import { ContentRating, } from "../../characters/spec";

export const dataProperties = {
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
      ContentRating.Sfw,
      ContentRating.NsfwMild,
      ContentRating.NsfwModerate,
      ContentRating.NsfwIntense,
      ContentRating.NsfwExtreme,
    ],
    default: ContentRating.Sfw,
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
} as const;
