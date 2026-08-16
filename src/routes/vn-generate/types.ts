// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Dynamic Generation — shared types.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";

export interface GenerateStoryBody {
  sceneIndex: number;
  locationId?: string;
  characterIds?: string[];
  context?: string;
  style?: "narration" | "dialogue" | "action" | "description";
  maxTokens?: number;
}

export interface GenerateChoicesBody {
  sceneIndex: number;
  count?: number;
  context?: string;
  style?: "free" | "guided" | "constrained";
  maxTokens?: number;
}

export interface StoryGenerationResult {
  content: string;
  sceneIndex: number;
  metadata: {
    model?: string;
    provider?: string;
    tokens?: number;
  };
}

export interface ChoiceGenerationResult {
  choices: {
    label: string;
    description: string;
    consequences?: Record<string, unknown>;
    relationshipImpact?: Record<string, unknown>;
    moodImpact?: Record<string, unknown>;
  }[];
  sceneIndex: number;
  metadata: {
    model?: string;
    provider?: string;
    tokens?: number;
  };
}

export interface VnGenerateRouteOpts {
  database: Kysely<DB>;
  config: Config;
}
