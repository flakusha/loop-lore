// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared types, constants, and clamping helpers for the `/create` quality
 * pipeline. Imported by {@link ./entity-creation-lore} and
 * {@link ./entity-creation-gates}; the original `entity-creation.ts` shim
 * was removed in favour of these focused modules.
 */

import { LorePosition, } from "../../db/enums-story";
import type { LoreSubject, } from "../lore/audience";
import type { EntityKind, } from "../prompt/templates/entity-generation";

/** Structured lore entry emitted by the LLM for `/create` entities. */
export interface GeneratedEntityLoreEntry {
  name: string;
  content: string;
  /** Keyword triggers — clamped to 5 entries, each <= 100 chars. */
  keys?: string[];
  /** Audience scope subject — validated via normalizeAudienceScope. */
  subject?: LoreSubject;
  /** Location lore is only known while the actor is present there. */
  requires_presence?: boolean;
  /** Always-on lore (not gated by selective activation). */
  constant?: boolean;
  /** Gated by keyword/scan matching rather than always-on. */
  selective?: boolean;
  /** Narrative position in the character sheet. */
  position?: LorePosition;
  insertion_order?: number;
  priority?: number;
  cooldown_seconds?: number;
}

/** Parsed fields produced by the LLM, all optional strings except `name`. */
export interface GeneratedEntity {
  name: string;
  description?: string;
  personality?: string;
  appearance?: string;
  defaultOutfit?: string;
  scenario?: string;
  /** Structured lore entries when the model emits `lore[]`, or prose string for backward compat. */
  lore?: string | GeneratedEntityLoreEntry[];
}

/** Maximum number of keyword keys per lore entry. */
export const MAX_KEYS = 5;
/** Maximum length of a single keyword key. */
export const MAX_KEY_LENGTH = 100;

/** Per-kind required field sets. `name` is always required. Character also requires personality + appearance (spec mandatory set). */
export const REQUIRED_FIELDS: Record<EntityKind, string[]> = {
  character: ["name", "description", "personality", "appearance",],
  location: ["name", "description",],
  world: ["name", "description",],
  item: ["name", "description",],
};

/** Clamp a numeric/string input to a non-negative integer. */
export function clampNonNegativeInt(value: unknown,): number | undefined {
  if (typeof value === "number" && Number.isFinite(value,)) {
    return Math.max(0, Math.floor(value,),);
  }
  if (typeof value === "string") {
    const n = Number(value,);
    if (Number.isFinite(n,)) { return Math.max(0, Math.floor(n,),); }
  }
  return undefined;
}

/** Clamp a numeric/string input to an integer in `[min, max]`. */
export function clampInt(value: unknown, min: number, max: number,): number | undefined {
  if (typeof value === "number" && Number.isFinite(value,)) {
    return Math.max(min, Math.min(max, Math.floor(value,),),);
  }
  if (typeof value === "string") {
    const n = Number(value,);
    if (Number.isFinite(n,)) { return Math.max(min, Math.min(max, Math.floor(n,),),); }
  }
  return undefined;
}

/** True when the string is a valid `LorePosition` enum member. */
export function isValidLorePosition(value: string,): boolean {
  return Object.values(LorePosition,).includes(value as LorePosition,);
}

/** Outcome of a single gate. */
export interface GateResult {
  ok: boolean;
  /** When not ok, a human-readable reason (used to reject or warn). */
  message?: string;
}

/** Aggregated quality report from `runQualityGates`. */
export interface QualityReport {
  /** Schema gate — hard reject when false. */
  schema: GateResult;
  /** Duplicate-name gate — warning when `duplicate.found`. */
  duplicate: { found: boolean; existingId?: string; message?: string };
  /** Consistency gate — warning when non-empty. */
  consistency: { warnings: string[] };
}
