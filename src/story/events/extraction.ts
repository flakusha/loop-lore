// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 269

/**
 * Event Extraction
 *
 * Parse story events from LLM narrative responses using
 * regex pattern matching and keyword analysis.
 * Future: delegate to lightweight LLM for structured extraction.
 */
import { WorldEventType, } from "../../db/enums";
import {
  COMBAT_PATTERNS,
  ITEM_PATTERNS,
  LOCATION_PATTERNS,
  LORE_PATTERNS,
  NPC_PATTERNS,
  TIME_PATTERNS,
} from "../../regex/story-events";
import type { WorldEvent, } from "../types";

// ── Location Change Patterns ─────────────────────────────────

// Single source of truth for every pattern lives in
// src/regex/story-events.ts; the detectors below read these aliases.
const locationPatterns = LOCATION_PATTERNS;
const timePatterns = TIME_PATTERNS;
const combatPatterns = COMBAT_PATTERNS;
const npcPatterns = NPC_PATTERNS;
const itemPatterns = ITEM_PATTERNS;
const lorePatterns = LORE_PATTERNS;

// ── Time Advancement Patterns (see aliases above; kept as a section marker) ─

// ── Combat Patterns (see aliases above; kept as a section marker) ─

// ── NPC State Change Patterns (see aliases above; kept as a section marker) ─

// ── Item Transfer Patterns (see aliases above; kept as a section marker) ─

// ── Lore Update Patterns (see aliases above; kept as a section marker) ─

// ── Options ──────────────────────────────────────────────────

/** */
export interface ExtractEventsOpts {
  messageContent: string;
  actorId: string;
  currentLocationId: string | null;
}

// ── Extraction ────────────────────────────────────────────────

/**
 * Extract structured events from a narrative message.
 * For v1, uses regex pattern matching and keyword analysis.
 * Future: delegate to a lightweight LLM for structured extraction.
 * @param root0
 * @param root0.messageContent
 * @param root0.actorId
 * @param root0.currentLocationId
 * @returns {WorldEvent[]}
 */
export function extractEvents({
  messageContent,
  actorId,
  currentLocationId,
}: ExtractEventsOpts,): WorldEvent[] {
  const events: WorldEvent[] = [];
  const timestamp = new Date().toISOString();

  const locationEvent = detectLocationChange(messageContent, actorId, currentLocationId ?? undefined, timestamp,);
  if (locationEvent) { events.push(locationEvent,); }

  const timeEvent = detectTimeAdvancement(messageContent, actorId, timestamp,);
  if (timeEvent) { events.push(timeEvent,); }

  const combatEvent = detectCombat(messageContent, actorId, timestamp,);
  if (combatEvent) { events.push(combatEvent,); }

  const npcEvent = detectNpcStateChange(messageContent, actorId, timestamp,);
  if (npcEvent) { events.push(npcEvent,); }

  const itemEvents = detectItemTransfers(messageContent, actorId, currentLocationId ?? undefined, timestamp,);
  events.push(...itemEvents,);

  const loreEvent = detectLoreUpdate(messageContent, actorId, timestamp,);
  if (loreEvent) { events.push(loreEvent,); }

  return events;
}

// ── Per-type detection helpers ──────────────────────────────

/**
 * @param content
 * @param actorId
 * @param currentLocationId
 * @param timestamp
 */
function detectLocationChange(
  content: string,
  actorId: string,
  currentLocationId: string | undefined,
  timestamp: string,
): WorldEvent | null {
  for (const pattern of locationPatterns) {
    const match = pattern.exec(content,);
    if (match?.[1]) {
      return {
        type: WorldEventType.LocationChange,
        actorId,
        locationId: currentLocationId ?? undefined,
        timestamp,
        data: { toLocationName: match[1].trim(), fromLocationId: currentLocationId, reason: "narrative", },
        description: `${actorId} moved to ${match[1].trim()}`,
      };
    }
  }

  return null;
}

/**
 * @param content
 * @param actorId
 * @param timestamp
 */
function detectTimeAdvancement(content: string, actorId: string, timestamp: string,): WorldEvent | null {
  for (const pattern of timePatterns) {
    if (pattern.test(content,)) {
      return {
        type: WorldEventType.TimeAdvancement,
        actorId,
        timestamp,
        data: { minutesAdvanced: 120, newTimeOfDay: "unknown", reason: "narrative time skip", },
        description: "Time advanced in the narrative",
      };
    }
  }

  return null;
}

/**
 * @param content
 * @param actorId
 * @param timestamp
 */
function detectCombat(content: string, actorId: string, timestamp: string,): WorldEvent | null {
  const lower = content.toLowerCase();
  for (const pattern of combatPatterns) {
    if (pattern.test(content,)) {
      return {
        type: WorldEventType.CombatEvent,
        actorId,
        timestamp,
        data: {
          attackerId: actorId,
          defenderId: "unknown",
          damage: 0,
          damageType: "physical",
          statusEffects: [],
          defeated: lower.includes("defeated",) || lower.includes("killed",) || lower.includes("slain",),
        },
        description: "Combat occurred in the narrative",
      };
    }
  }

  return null;
}

/**
 * @param content
 * @param actorId
 * @param timestamp
 */
function detectNpcStateChange(content: string, actorId: string, timestamp: string,): WorldEvent | null {
  for (const pattern of npcPatterns) {
    if (pattern.test(content,)) {
      return {
        type: WorldEventType.NpcStateChange,
        actorId,
        timestamp,
        data: { npcActorId: actorId, changes: { mental_state: "changed", }, },
        description: "NPC state changed",
      };
    }
  }

  return null;
}

/**
 * @param content
 * @param actorId
 * @param currentLocationId
 * @param timestamp
 */
function detectItemTransfers(
  content: string,
  actorId: string,
  currentLocationId: string | undefined,
  timestamp: string,
): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const pattern of itemPatterns) {
    const match = pattern.exec(content,);
    if (match?.[1]) {
      const direct = match[0].toLowerCase();
      const isSource = /gives|hands|offers|passes|trades|drops|leaves|abandons|puts/.test(direct,);
      events.push({
        type: WorldEventType.ItemTransfer,
        actorId,
        timestamp,
        locationId: currentLocationId ?? undefined,
        data: {
          fromActorId: isSource ? actorId : null,
          toActorId: isSource ? null : actorId,
          itemName: match[1].trim(),
          quantity: 1,
        },
        description: `Item interaction: ${match[1].trim()}`,
      },);
    }
  }

  return events;
}

/**
 * @param content
 * @param actorId
 * @param timestamp
 */
function detectLoreUpdate(content: string, actorId: string, timestamp: string,): WorldEvent | null {
  for (const pattern of lorePatterns) {
    if (!pattern.test(content,)) { continue; }
    const sentences = content.split(/[.!?]+/,);
    const loreSentence = sentences.find((s,) => pattern.test(s,));
    if (loreSentence) {
      return {
        type: WorldEventType.WorldLoreUpdate,
        actorId,
        timestamp,
        data: { newLoreEntry: loreSentence.trim(), category: "narrative_revelation", confidence: 0.5, },
        description: "New world lore revealed",
      };
    }
  }

  return null;
}
