// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * In-story entity introduction detection
 * (FEAT-in-story-character-generation-via-assistant-chat-handoff).
 *
 * Regex pass over GM/story narration that flags passages introducing a new,
 * not-yet-generated entity — the trigger for the optional in-place generation
 * handoff. Detection is advisory: an ambient introduction with no generation
 * is a valid no-op path, so a miss or a false positive never blocks the story.
 * Modeled on regex/story-events.ts.
 */

import type { EntityKind, } from "../assistant/prompt/templates/entity-generation";

// ── Introduction patterns ─────────────────────────────────────

/** NPC/character introductions: "a stranger named Aldric", "meets a woman called Mira" */
export const CHARACTER_INTRODUCTION =
  /\b(?:a|an)\s+((?:\w+\s+){0,2}?)(?:stranger|traveler|traveller|figure|merchant|guard|mage|knight|assassin|noble|child|woman|man|elder|blacksmith|innkeeper)\s+(?:named|called)\s+([A-Z][\w'-]*)/gi;

/** Direct character introductions: "Aldric, a former soldier, enters" */
export const CHARACTER_APPEARANCE =
  /\b([A-Z][\w'-]*)\s*,\s*(?:a|an)\s+([\w\s-]{3,40}?),\s*(?:enters|approaches|appears|arrives|steps)/gi;

/** Location introductions: "they reach a settlement called Ravenhollow" */
export const LOCATION_INTRODUCTION =
  /\b(?:reach(?:es)?|arriv(?:e|es|ing)(?:\s+at)?|discover(?:s|ed)?|find(?:s)?)\s+(?:a|an|the)\s+([\w\s-]{3,40}?)\s+(?:called|named)\s+([A-Z][\w'-]*)/gi;

/** Item introductions: "hands over a blade named Duskbringer", "an amulet called X" */
export const ITEM_INTRODUCTION = /\b(?:a|an)\s+([\w\s-]{3,30}?)\s+(?:named|called)\s+([A-Z][\w'-]*)/gi;

// ── Detection result ──────────────────────────────────────────

/** One detected, unconfirmed in-story introduction. */
export interface StoryEntityIntroduction {
  kind: EntityKind;
  /** Tentative entity name captured from the text (may be empty). */
  name: string;
  /** Descriptive fragment around the introduction (seed material). */
  context: string;
  /** Character offset of the match start in the source text. */
  index: number;
}

interface KindPattern {
  kind: EntityKind;
  pattern: RegExp;
  /** Capture group holding the entity name (default 2). */
  nameGroup?: number;
}

const INTRODUCTION_PATTERNS: readonly KindPattern[] = [
  { kind: "character", pattern: CHARACTER_INTRODUCTION, },
  { kind: "character", pattern: CHARACTER_APPEARANCE, nameGroup: 1, },
  { kind: "location", pattern: LOCATION_INTRODUCTION, },
  { kind: "item", pattern: ITEM_INTRODUCTION, },
];

/**
 * Detect possible in-story entity introductions in narration text.
 * Pure; advisory only — callers surface suggestions, never auto-create.
 *
 * @param text - Story/GM narration to scan
 * @returns Detections in text order; overlapping duplicates kept per kind
 */
export function detectStoryEntityIntroductions(text: string,): StoryEntityIntroduction[] {
  const found: StoryEntityIntroduction[] = [];
  for (const { kind, pattern, nameGroup, } of INTRODUCTION_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags,);
    for (let m = re.exec(text,); m !== null; m = re.exec(text,)) {
      const rawName = m[nameGroup ?? 2];
      const name = (rawName === undefined ? "" : rawName).trim();
      found.push({
        kind,
        name,
        context: m[0].trim(),
        index: m.index,
      },);
    }
  }
  return found.sort((a, b,) => a.index - b.index);
}

/**
 * Build the seed text handed to a creation chat for one detection.
 * @param intro - The detection
 * @param narration - Full narration the detection came from
 * @returns Seed lines describing the entity for the finalize steps
 */
export function buildEntitySeed(intro: StoryEntityIntroduction, narration: string,): string {
  const name = intro.name === "" ? "(name unknown)" : intro.name;
  return [name, intro.context, narration.slice(intro.index, intro.index + 280,).trim(),].join("\n",);
}
