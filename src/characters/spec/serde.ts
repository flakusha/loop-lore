// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/spec/serde.ts — Serialization / import-export types

import type { CanonicalCharacter, } from "./character";
import type { ImportFormat, ReviewRole, ReviewState, } from "./enums";

// ── Parse Result ──────────────────────────────
/** */
export type CharacterFormat =
  | "ccv2"
  | "ccv3"
  | "character-ai"
  | "json-flat"
  | "yaml"
  | "toml"
  | "png-v2"
  | "png-v3"
  | "charx";

/** */
export interface ParseResult {
  character: CanonicalCharacter;
  format: CharacterFormat;
  warnings: string[];
}

/** */
export interface ParseError {
  code:
    | "FORMAT_NOT_DETECTED"
    | "PARSE_ERROR"
    | "VALIDATION_ERROR"
    | "UNSUPPORTED_VERSION"
    | "FILE_READ_ERROR";
  message: string;
  details?: {
    line?: number;
    column?: number;
    field?: string;
    expected?: string;
    actual?: string;
  };
  suggestion?: string;
}

// ── Review Entry ─────────────────────────────────────
/** */
export interface ReviewEntry {
  id: string;
  character_id: string;
  reviewer_role: ReviewRole;
  reviewer_id: string;
  from_state: ReviewState;
  to_state: ReviewState;
  feedback: string | null;
  confidence: number | null;
  created_at: string;
}

// ── Import Job ───────────────────────────────────────
/** */
export interface ImportJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  format: ImportFormat;
  character_id: string | null;
  warnings: string[];
  errors: string[];
  created_at: string;
  completed_at: string | null;
}

// ── Plugin Bundle ────────────────────────────────────
/** */
export interface PluginBundle {
  id: string;
  name: string;
  version: string;
  description?: string;
  stats: BundleStat[];
  skills: BundleSkill[];
  actions: BundleAction[];
}

/** */
export interface BundleStat {
  name: string;
  label: string;
  description: string;
  min: number;
  max: number;
  default: number;
}

/** */
export interface BundleSkill {
  name: string;
  label: string;
  description: string;
  stat: string;
  level_cap: number;
}

/** */
export interface BundleAction {
  name: string;
  label: string;
  description: string;
  requires: string[];
  damage_stat?: string;
}
