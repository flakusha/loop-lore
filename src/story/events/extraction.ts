/**
 * Event Extraction
 *
 * Parse story events from LLM narrative responses using
 * regex pattern matching and keyword analysis.
 * Future: delegate to lightweight LLM for structured extraction.
 */
import { WorldEventType } from "../../db/enums";
import type { WorldEvent } from "../types";

// ── Location Change Patterns ─────────────────────────────────

/* eslint-disable sonarjs/regex-complexity, sonarjs/super-linear-regex, sonarjs/duplicates-in-character-class */
const locationPatterns = [
  /(?:enters?|moves?\s+to|arrives?\s+at|steps?\s+into|walks?\s+into|goes?\s+to|heads?\s+(?:to|toward)|leaves?\s+the)\s+[""']?([A-Za-z\s]+?)[""']?(?:[,.;!])/gi,
  /(?:makes?\s+(?:their\s+)?way\s+to(?:wards?)?|travels?\s+to|ventures?\s+into)\s+[""']?([A-Za-z\s]+?)[""']?(?:[,.;!])/gi,
];

// ── Time Advancement Patterns ─────────────────────────────────

const timePatterns = [
  /(?:hours?\s+(?:pass|go\s+by|elapse)|later\s+that\s+(?:day|night|evening|morning|afternoon)|(?:after|by)\s+(?:a\s+)?few\s+hours)/gi,
  /(?:the\s+(?:sun|moon)\s+(?:rises?|sets?)|dawn\s+(?:breaks?|approaches?)|dusk\s+(?:falls?|settles?)|night\s+(?:falls?|arrives?))/gi,
  /(?:the\s+next\s+(?:day|morning|evening)|a\s+(?:day|week|month)\s+later)/gi,
];

// ── Combat Patterns ───────────────────────────────────────────

const combatPatterns = [
  /(?:strikes?|hits?|slashes?|stabs?|shoots?|fires?\s+(?:at|upon)|attacks?|battles?|fights?|wounds?|injures?)/gi,
  /(?:takes?\s+\d+\s+(?:damage|hits?)|loses?\s+\d+\s+hp|health\s+(?:drops?|falls?)\s+to\s+\d+)/gi,
];

// ── NPC State Change Patterns ─────────────────────────────────

const npcPatterns = [
  /(?:looks?\s+(?:calm|afraid|angry|suspicious|friendly|worried|happy|sad|confused|determined))/gi,
  /(?:becomes?\s+(?:more|less)\s+(?:friendly|hostile|suspicious|trusting))/gi,
  /(?:reveals?|tells?\s+|confesses?|shares?|admits?)\s+(?:that\s+)?(?:he|she|they)\s+(?:knows?|has|found|discovered)/gi,
];

// ── Item Transfer Patterns ────────────────────────────────────

const itemPatterns = [
  /(?:gives?|hands?|offers?|passes?|trades?)\s+(?:the\s+|a\s+|an\s+)?[""']?([A-Za-z\s]+?)[""']?\s+(?:to\s+|for\s+)/gi,
  /(?:takes?|picks?\s+up|grabs?|collects?|acquires?|receives?|finds?)\s+(?:the\s+|a\s+|an\s+)?[""']?([A-Za-z\s]+?)[""']?/gi,
  /(?:drops?|leaves?\s+behind|abandons?|puts?\s+down)\s+(?:the\s+|a\s+|an\s+)?[""']?([A-Za-z\s]+?)[""']?/gi,
];

// ── Lore Update Patterns ──────────────────────────────────────

const lorePatterns = [
  /(?:reveals?\s+that|discover(?:s|ed)\s+that|learn(?:s|ed)\s+that|uncovers?|unearth(?:s|ed)|realiz(?:es?|ed)\s+that)/gi,
  /(?:according\s+to\s+(?:legend|ancient|old)\s+(?:texts?|records?|tales?|scrolls?))/gi,
];
/* eslint-enable sonarjs/regex-complexity, sonarjs/super-linear-regex, sonarjs/duplicates-in-character-class */

// ── Extraction ────────────────────────────────────────────────

/**
 * Extract structured events from a narrative message.
 * For v1, uses regex pattern matching and keyword analysis.
 * Future: delegate to a lightweight LLM for structured extraction.
 */
export function extractEvents(
  messageContent: string,
  actorId: string,
  currentLocationId: string | null,
): WorldEvent[] {
  // Reset module-scoped regex lastIndex to avoid state bleed across calls
  for (const p of locationPatterns) p.lastIndex = 0;
  for (const p of timePatterns) p.lastIndex = 0;
  for (const p of combatPatterns) p.lastIndex = 0;
  for (const p of npcPatterns) p.lastIndex = 0;
  for (const p of itemPatterns) p.lastIndex = 0;
  for (const p of lorePatterns) p.lastIndex = 0;

   
  const events: WorldEvent[] = [];
  const timestamp = new Date().toISOString();
  const lower = messageContent.toLowerCase();

  // Location change detection
  for (const pattern of locationPatterns) {
    const match = pattern.exec(messageContent);
    if (match?.[1]) {
      events.push({
        type: WorldEventType.LocationChange,
        actorId,
        locationId: currentLocationId ?? undefined,
        timestamp,
        data: {
          toLocationName: match[1].trim(),
          fromLocationId: currentLocationId,
          reason: "narrative",
        },
        description: `${actorId} moved to ${match[1].trim()}`,
      });
    }
  }

  // Time advancement detection
  for (const pattern of timePatterns) {
    if (pattern.test(messageContent)) {
      events.push({
        type: WorldEventType.TimeAdvancement,
        actorId,
        timestamp,
        data: {
          minutesAdvanced: 120, // ~2 hours default; refine with NLP later
          newTimeOfDay: "unknown",
          reason: "narrative time skip",
        },
        description: "Time advanced in the narrative",
      });
      break;
    }
  }

  // Combat detection
  for (const pattern of combatPatterns) {
    if (pattern.test(messageContent)) {
      events.push({
        type: WorldEventType.CombatEvent,
        actorId,
        timestamp,
        data: {
          attackerId: actorId,
          defenderId: "unknown",
          damage: 0,
          damageType: "physical",
          statusEffects: [],
          defeated: lower.includes("defeated") || lower.includes("killed") || lower.includes("slain"),
        },
        description: "Combat occurred in the narrative",
      });
      break;
    }
  }

  // NPC state change detection
  for (const pattern of npcPatterns) {
    if (pattern.test(messageContent)) {
      events.push({
        type: WorldEventType.NpcStateChange,
        actorId,
        timestamp,
        data: {
          npcActorId: actorId,
          changes: { mental_state: "changed" },
        },
        description: "NPC state changed",
      });
      break;
    }
  }

  // Item transfer detection
  for (const pattern of itemPatterns) {
    const match = pattern.exec(messageContent);
    if (match?.[1]) {
      events.push({
        type: WorldEventType.ItemTransfer,
        actorId,
        timestamp,
        data: {
          fromActorId: null,
          toActorId:
            match[0].toLowerCase().includes("drops") || match[0].toLowerCase().includes("leaves")
              ? null
              : actorId,
          itemName: match[1].trim(),
          quantity: 1,
        },
        description: `Item interaction: ${match[1].trim()}`,
      });
    }
  }

  // Lore update detection (new facts about the world revealed)
  for (const pattern of lorePatterns) {
    if (pattern.test(messageContent)) {
      // Extract the sentence containing the lore
      const sentences = messageContent.split(/[.!?]+/);
      const loreSentence = sentences.find((s) => pattern.test(s));
      if (loreSentence) {
        events.push({
          type: WorldEventType.WorldLoreUpdate,
          actorId,
          timestamp,
          data: {
            newLoreEntry: loreSentence.trim(),
            category: "narrative_revelation",
            confidence: 0.5,
          },
          description: "New world lore revealed",
        });
      }
      break;
    }
  }

  return events;
}
