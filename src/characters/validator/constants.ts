// src/characters/validator/constants.ts — Field constraints and content-rating tables

import type { ContentRating, } from "../spec";

interface FieldConstraints {
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  maxItemLength?: number;
  required: boolean;
}

export const CONSTRAINTS: Record<string, FieldConstraints> = {
  name: { minLength: 1, maxLength: 64, required: true, },
  description: { minLength: 1, maxLength: 5000, required: true, },
  personality: { minLength: 1, maxLength: 2000, required: true, },
  scenario: { maxLength: 5000, required: false, },
  welcome_message: { maxLength: 5000, required: false, },
  mes_example: { maxLength: 10_000, required: false, },
  system_prompt: { maxLength: 10_000, required: false, },
  post_history_instructions: { maxLength: 5000, required: false, },
  alternate_greetings: { maxItems: 10, maxItemLength: 5000, required: false, },
  tags: { maxItems: 20, maxItemLength: 32, required: false, },
  creator: { maxLength: 64, required: false, },
  creator_notes: { maxLength: 2000, required: false, },
  character_version: { maxLength: 16, required: false, },
  nickname: { maxLength: 64, required: false, },
  nsfw_categories: { maxItems: 50, required: false, },
  nsfw_hard_limits: { maxItems: 50, required: false, },
};

export const VALID_CONTENT_RATINGS: ContentRating[] = [
  "sfw",
  "nsfw_mild",
  "nsfw_moderate",
  "nsfw_intense",
  "nsfw_extreme",
];

export const AGE_REQUIREMENTS: Record<ContentRating, number | null> = {
  sfw: null,
  nsfw_mild: 13,
  nsfw_moderate: 18,
  nsfw_intense: 18,
  nsfw_extreme: 18,
};
