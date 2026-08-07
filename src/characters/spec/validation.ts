// src/characters/spec/validation.ts — Validation types

import type { ContentRating, } from "./enums";

// ── World Validation ────────────────────────────────
export interface WorldValidationRules {
  world_id: string;
  allowed_content_ratings: ContentRating[];
  max_description_length: number;
  required_fields: string[];
  forbidden_tags: string[];
  custom_validators?: CustomValidator[];
}

export interface CustomValidator {
  field: string;
  rule: string;
  message: string;
  params?: Record<string, unknown>;
}

// ── World Style Rules ───────────────────────────────
export interface WorldStyleRules {
  world_id: string;
  speech_style: "formal" | "informal" | "neutral" | "custom";
  allowed_personality_traits?: string[];
  forbidden_personality_traits?: string[];
  expression_modifiers?: Record<string, unknown>;
}

// ── Validation Result ────────────────────────────────
export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value: unknown;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  value: unknown;
}
