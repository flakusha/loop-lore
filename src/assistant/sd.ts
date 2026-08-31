// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stable Diffusion Adapter (Epic 42)
 *
 * Adapter for generating images via Stable Diffusion providers.
 * Supports ComfyUI and other SD-compatible APIs.
 *
 * Entity→asset mapping:
 * | Entity    | Asset kind     |
 * | --------- | -------------- |
 * | Character | Portrait       |
 * | Item      | Icon / render  |
 * | Location  | Scene art      |
 * | World     | Map / mood art |
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";

/** Reference to a game entity */
export interface EntityRef {
  type: "character" | "item" | "location" | "world";
  id: string;
}

/** Request for Stable Diffusion image generation */
export interface SDRequest {
  /** Text prompt for image generation */
  prompt: string;
  /** Negative prompt to exclude unwanted elements */
  negative_prompt?: string;
  /** Entity reference for asset mapping */
  entity_ref: EntityRef;
  /** Image dimensions [width, height] */
  size: [number, number,];
  /** Random seed for reproducibility */
  seed?: number;
  /** Emotion type for emotion-aware generation (e.g., avatar variants) */
  emotion?: string;
}

/** Response from SD generation */
export interface SDResponse {
  /** Asset ID of the generated image */
  assetId: string;
  /** URL to the generated image */
  url: string;
  /** Thumbnail URL */
  thumbUrl: string;
  /** Seed used for generation */
  seed: number;
}

/** SD provider configuration */
export interface SDProviderConfig {
  /** Provider type (comfyui, openai, etc.) */
  type: string;
  /** API endpoint URL */
  endpoint: string;
  /** API key (if required) */
  apiKey?: string;
  /** Default model/checkpoint */
  model?: string;
}

/**
 * Generate an image via Stable Diffusion.
 * @param db - Database instance
 * @param _db
 * @param request - Generation request
 * @param config - Provider configuration
 * @param _config
 * @returns Generated image asset reference
 */
export function generateImage(
  _db: Kysely<DB>,
  request: SDRequest,
  _config: SDProviderConfig,
): SDResponse {
  // TODO: Call SD provider API
  // TODO: Store generated asset in assets table
  // TODO: Link asset to entity via polymorphic linking

  // Placeholder — returns a mock response
  return {
    assetId: `sd-${Date.now()}`,
    url: `/api/assets/sd-${Date.now()}/raw`,
    thumbUrl: `/api/assets/sd-${Date.now()}/thumb`,
    seed: request.seed ?? Math.floor(Math.random() * 1_000_000,),
  };
}

/**
 * Get the asset kind for a given entity type.
 * @param entityType - Entity type
 * @returns Asset kind description
 */
export function getAssetKind(entityType: EntityRef["type"],): string {
  const mapping: Record<EntityRef["type"], string> = {
    character: "portrait",
    item: "icon",
    location: "scene art",
    world: "map",
  };
  return mapping[entityType];
}

/**
 * Build a prompt for entity image generation.
 * @param entityType - Entity type
 * @param description - Entity description
 * @returns Formatted prompt for SD
 */
export function buildEntityPrompt(entityType: EntityRef["type"], description: string,): string {
  const style = "digital art, high quality, detailed";
  const entityPrompts: Record<EntityRef["type"], string> = {
    character: `character portrait of ${description}, ${style}`,
    item: `item icon of ${description}, ${style}`,
    location: `scene art of ${description}, ${style}`,
    world: `map of ${description}, ${style}`,
  };
  return entityPrompts[entityType];
}
