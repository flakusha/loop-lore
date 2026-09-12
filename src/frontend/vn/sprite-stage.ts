// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN sprite stage — per-chat roster, deterministic multi-character slot
 * assignment, and active-speaker highlight.
 *
 * Covers four linked tickets without backend changes:
 * - TASK-vn-character-sprite-roster-per-chat (roster CRUD + variant fallback)
 * - TASK-vn-multi-character-sprite-ordering-and-positioning (slots + z-order)
 * - TASK-vn-active-speaker-sprite-highlight-and-dimming (focus states)
 * - TASK-vn-emotion-mood-and-action-driven-sprite-staging, frontend half
 *   (directives in ./stage-directives; see below for deferred backend parts)
 *
 * Deferred (need backend pipelines): LLM emotion classification
 * (TASK-aux-llm-emotion-classifier), action-verb extractors over
 * src/regex patterns, alpha matting jobs (ea6d881).
 */

import {
  createPortraitElement,
  getPortraitUrl,
} from "./portrait-manager";
import { isAssetIdRef, } from "./sprite-anchor";

/** Ordered stage slots, left to right. */
export type StageSlot = "far-left" | "left" | "center" | "right" | "far-right";

/** One cast member registered for a chat's VN stage. */
export interface SpriteRosterEntry {
  /** Stable per-character key (actor id or name slug). */
  characterId: string;
  /** Display name. */
  name: string;
  /** Base sprite asset id or URL. */
  avatarAssetId?: string;
  /** Per-emotion sprite overrides; missing emotion falls back to base. */
  emotionVariants?: Record<string, string>;
  /** Hidden members stay registered but leave the stage. */
  visible?: boolean;
}

/** Mutable per-chat cast registry. Insertion order is stage order. */
export interface SpriteRoster {
  entries: SpriteRosterEntry[];
}

/** A roster entry placed on stage with focus state. */
export interface StagedSprite {
  entry: SpriteRosterEntry;
  slot: StageSlot;
  zIndex: number;
  active: boolean;
  dimmed: boolean;
}

/** Slot layouts per visible cast size (deterministic, centered). */
const SLOT_LAYOUTS: readonly (readonly StageSlot[])[] = [
  ["center",],
  ["left", "right",],
  ["left", "center", "right",],
  ["far-left", "left", "right", "far-right",],
  ["far-left", "left", "center", "right", "far-right",],
];

/** Maximum sprites composed on stage; extras stay in the roster off-stage. */
export const MAX_STAGE_SPRITES = 5;

/**
 * Create an empty roster, optionally seeded.
 * @param entries - Seed entries.
 */
export function createRoster(entries: SpriteRosterEntry[] = [],): SpriteRoster {
  return { entries: entries.map((e,) => ({ visible: true, ...e, })), };
}

/**
 * Add or replace a cast member by characterId.
 * @param roster - Roster to mutate.
 * @param entry - Entry to upsert.
 */
export function addToRoster(roster: SpriteRoster, entry: SpriteRosterEntry,): void {
  const at = roster.entries.findIndex((e,) => e.characterId === entry.characterId);
  if (at < 0) {
    roster.entries.push({ visible: true, ...entry, },);
    return;
  }
  roster.entries[at] = { visible: true, ...entry, };
}

/**
 * Remove a cast member by id.
 * @param roster - Roster to mutate.
 * @param characterId - Member key.
 * @returns True when an entry was removed.
 */
export function removeFromRoster(roster: SpriteRoster, characterId: string,): boolean {
  const at = roster.entries.findIndex((e,) => e.characterId === characterId);
  if (at < 0) { return false; }
  roster.entries.splice(at, 1,);
  return true;
}

/**
 * Toggle stage visibility without dropping registration.
 * @param roster - Roster to mutate.
 * @param characterId - Member key.
 * @param visible - Stage presence.
 * @returns True when the member exists.
 */
export function setSpriteVisibility(
  roster: SpriteRoster,
  characterId: string,
  visible: boolean,
): boolean {
  const entry = roster.entries.find((e,) => e.characterId === characterId);
  if (!entry) { return false; }
  entry.visible = visible;
  return true;
}

/**
 * Resolve the sprite URL for an entry, preferring the emotion variant.
 * @param entry - Roster entry.
 * @param emotion - Optional emotion key (e.g. "happy").
 * @returns Thumb route/URL, or undefined when no sprite is registered.
 */
export function resolveSpriteUrl(entry: SpriteRosterEntry, emotion?: string,): string | undefined {
  const variants = entry.emotionVariants;
  // Variant keys come from the emotion-avatar pipeline while scene emotions
  // arrive as lowercase hook values — compare case-insensitively so "Happy"
  // matches "happy"; anything unmatched falls back to the base sprite.
  const variant = emotion && variants
    ? Object.entries(variants,).find(([key,],) => key.toLowerCase() === emotion.toLowerCase())?.[1]
    : undefined;
  return getPortraitUrl(variant ?? entry.avatarAssetId,);
}

/**
 * Assign deterministic stage slots to the visible cast.
 * Narration (no speaker) dims the whole stage; otherwise the speaker is
 * active and everyone else is dimmed.
 * @param roster - Cast registry.
 * @param activeSpeakerId - Speaking member key, or null for narration.
 * @returns Staged sprites in roster order (max 5).
 */
export function assignStageSlots(roster: SpriteRoster, activeSpeakerId: string | null,): StagedSprite[] {
  const visible = roster.entries.filter((e,) => e.visible !== false).slice(0, MAX_STAGE_SPRITES,);
  const slots = SLOT_LAYOUTS[Math.min(visible.length, MAX_STAGE_SPRITES,) - 1] ?? [];
  return visible.map((entry, index,): StagedSprite => {
    const active = activeSpeakerId !== null && entry.characterId === activeSpeakerId;
    return {
      entry,
      slot: slots[index] ?? "center",
      // Background z-0 < sprites < dialogue UI (CSS: dialogue z-1 above
      // stage base; active sprite lifts one step but stays under UI).
      zIndex: active ? 10 + index : 1 + index,
      active,
      dimmed: activeSpeakerId === null || !active,
    };
  },);
}

/**
 * Apply focus-state classes to a sprite element. Visual only (filter /
 * opacity / scale) — no layout shift by design.
 * @param el - Sprite element from buildStageElement.
 * @param staged - Focus state.
 */
export function applyStageHighlight(el: HTMLElement, staged: StagedSprite,): void {
  el.classList.toggle("vn-speaker-active", staged.active,);
  el.classList.toggle("vn-speaker-dimmed", staged.dimmed,);
  el.style.zIndex = String(staged.zIndex,);
}

/**
 * Build a stage sprite element with slot + focus classes.
 * @param staged - Placed sprite.
 * @param emotion - Optional emotion key for variant resolution.
 */
export function buildStageElement(staged: StagedSprite, emotion?: string,): HTMLElement {
  const el = createPortraitElement({
    name: staged.entry.name,
    avatarUrl: resolveSpriteUrl(staged.entry, emotion,),
    position: "center",
  },);
  el.classList.add("vn-stage-sprite", `vn-slot-${staged.slot}`,);
  el.dataset["characterId"] = staged.entry.characterId;
  const variant = emotion && staged.entry.emotionVariants
    ? Object.entries(staged.entry.emotionVariants,).find(([key,],) => key.toLowerCase() === emotion.toLowerCase())?.[1]
    : undefined;
  const ref = variant ?? staged.entry.avatarAssetId;
  if (isAssetIdRef(ref,)) { el.dataset["assetId"] = ref; }
  applyStageHighlight(el, staged,);
  return el;
}
