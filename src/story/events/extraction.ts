// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Event Extraction
 *
 * Parse story events from LLM narrative responses using
 * regex pattern matching and keyword analysis.
 * Future: delegate to lightweight LLM for structured extraction.
 */
import { WorldEventType, } from "../../db/enums";
import type { WorldEvent, } from "../types";

// ── Location Change Patterns ─────────────────────────────────

const locationPatterns = [
  /(?:enters?|moves?\s+to|arrives?\s+at|steps?\s+into|walks?\s+into|goes?\s+to|heads?\s+(?:to|toward)|leaves?\s+the)\s+[""']?([A-Za-z\s]+?)[""']?(?:[,.;!])/i,
  /(?:makes?\s+(?:their\s+)?way\s+to(?:wards?)?|travels?\s+to|ventures?\s+into)\s+[""']?([A-Za-z\s]+?)[""']?(?:[,.;!])/i,
];

// ── Time Advancement Patterns ─────────────────────────────────

const timePatterns = [
  /(?:hours?\s+(?:pass|go\s+by|elapse)|later\s+that\s+(?:day|night|evening|morning|afternoon)|(?:after|by)\s+(?:a\s+)?few\s+hours)/i,
  /(?:the\s+(?:sun|moon)\s+(?:rises?|sets?)|dawn\s+(?:breaks?|approaches?)|dusk\s+(?:falls?|settles?)|night\s+(?:falls?|arrives?))/i,
  /(?:the\s+next\s+(?:day|morning|evening)|a\s+(?:day|week|month)\s+later)/i,
];

// ── Combat Patterns ───────────────────────────────────────────

const combatPatterns = [
  /(?:strikes?|hits?|slashes?|stabs?|shoots?|fires?\s+(?:at|upon)|attacks?|battles?|fights?|wounds?|injures?)/i,
  /(?:takes?\s+\d+\s+(?:damage|hits?)|loses?\s+\d+\s+hp|health\s+(?:drops?|falls?)\s+to\s+\d+)/i,
];

// ── NPC State Change Patterns ─────────────────────────────────

const npcPatterns = [
  /(?:looks?\s+(?:calm|afraid|angry|suspicious|friendly|worried|happy|sad|confused|determined))/i,
  /(?:becomes?\s+(?:more|less)\s+(?:friendly|hostile|suspicious|trusting))/i,
  /(?:reveals?|tells?\s+|confesses?|shares?|admits?)\s+(?:that\s+)?(?:he|she|they)\s+(?:knows?|has|found|discovered)/i,
];

// ── Item Transfer Patterns ────────────────────────────────────

const itemPatterns = [
  /(?:gives?|hands?|offers?|passes?|trades?)\s+(?:the\s+|a\s+|an\s+)?[""']?([A-Za-z\s]+?)[""']?\s+(?:to\s+|for\s+)/i,
  /(?:takes?|picks?\s+up|grabs?|collects?|acquires?|receives?|finds?)\s+(?:the\s+|a\s+|an\s+)?[""']?([A-Za-z\s]+?)[""']?/i,
  /(?:drops?|leaves?\s+behind|abandons?|puts?\s+down)\s+(?:the\s+|a\s+|an\s+)?[""']?([A-Za-z\s]+?)[""']?/i,
];

// ── Lore Update Patterns ──────────────────────────────────────

const lorePatterns = [
  /(?:reveals?\s+that|discover(?:s|ed)\s+that|learn(?:s|ed)\s+that|uncovers?|unearth(?:s|ed)|realiz(?:es?|ed)\s+that)/i,
  /(?:according\s+to\s+(?:legend|ancient|old)\s+(?:texts?|records?|tales?|scrolls?))/i,
];

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
