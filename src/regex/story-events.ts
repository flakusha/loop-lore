/**
 * Story Event Regex Patterns
 *
 * Patterns for extracting events from narrative text: location changes,
 * time advancement, combat, NPC state changes, item transfers, and lore.
 *
 * Source: src/story/events/extraction.ts
 */

// ── Location Change Patterns ─────────────────────────────────

/** Matches phrases like "enters the tavern", "moves to the forest", "heads toward castle" */
export const LOCATION_MOVEMENT = /(?:enters?|moves?\s+to|arrives?\s+at|steps?\s+into|walks?\s+into|goes?\s+to|heads?\s+(?:to|toward)|leaves?\s+the)\s+[""']?([A-Za-z\s]+?)[""']?(?:[,.;!])/i;

/** Matches phrases like "makes their way to the castle", "travels to the village", "ventures into the cave" */
export const LOCATION_TRAVEL = /(?:makes?\s+(?:their\s+)?way\s+to(?:wards?)?|travels?\s+to|ventures?\s+into)\s+[""']?([A-Za-z\s]+?)[""']?(?:[,.;!])/i;

// ── Time Advancement Patterns ─────────────────────────────────

/** Matches phrases like "hours pass", "later that day", "after a few hours" */
export const TIME_HOURS = /(?:hours?\s+(?:pass|go\s+by|elapse)|later\s+that\s+(?:day|night|evening|morning|afternoon)|(?:after|by)\s+(?:a\s+)?few\s+hours)/i;

/** Matches phrases like "the sun rises", "dawn breaks", "dusk falls", "night arrives" */
export const TIME_CELESTIAL = /(?:the\s+(?:sun|moon)\s+(?:rises?|sets?)|dawn\s+(?:breaks?|approaches?)|dusk\s+(?:falls?|settles?)|night\s+(?:falls?|arrives?))/i;

/** Matches phrases like "the next day", "a week later", "a month later" */
export const TIME_NEXT_PERIOD = /(?:the\s+next\s+(?:day|morning|evening)|a\s+(?:day|week|month)\s+later)/i;

// ── Combat Patterns ───────────────────────────────────────────

/** Matches combat action verbs: "strikes", "hits", "slashes", "attacks", etc. */
export const COMBAT_ACTION = /(?:strikes?|hits?|slashes?|stabs?|shoots?|fires?\s+(?:at|upon)|attacks?|battles?|fights?|wounds?|injures?)/i;

/** Matches damage descriptions: "takes 5 damage", "loses 10 hp", "health drops to 3" */
export const COMBAT_DAMAGE = /(?:takes?\s+\d+\s+(?:damage|hits?)|loses?\s+\d+\s+hp|health\s+(?:drops?|falls?)\s+to\s+\d+)/i;

// ── NPC State Change Patterns ─────────────────────────────────

/** Matches NPC emotional states: "looks calm", "becomes more friendly", etc. */
export const NPC_STATE = /(?:looks?\s+(?:calm|afraid|angry|suspicious|friendly|worried|happy|sad|confused|determined))/i;

/** Matches NPC disposition changes: "becomes more friendly", "becomes less hostile" */
export const NPC_DISPOSITION = /(?:becomes?\s+(?:more|less)\s+(?:friendly|hostile|suspicious|trusting))/i;

/** Matches NPC revelations: "reveals that she knows", "confesses that he has" */
export const NPC_REVELATION = /(?:reveals?|tells?\s+|confesses?|shares?|admits?)\s+(?:that\s+)?(?:he|she|they)\s+(?:knows?|has|found|discovered)/i;

// ── Item Transfer Patterns ────────────────────────────────────

/** Matches giving/handing items: "gives the sword to", "hands a potion for" */
export const ITEM_GIVE = /(?:gives?|hands?|offers?|passes?|trades?)\s+(?:the\s+|a\s+|an\s+)?[""']?([A-Za-z\s]+?)[""']?\s+(?:to\s+|for\s+)/i;

/** Matches taking/picking up items: "takes the key", "picks up a scroll" */
export const ITEM_TAKE = /(?:takes?|picks?\s+up|grabs?|collects?|acquires?|receives?|finds?)\s+(?:the\s+|a\s+|an\s+)?[""']?([A-Za-z\s]+?)[""']?/i;

/** Matches dropping/leaving items: "drops the sword", "leaves behind a note" */
export const ITEM_DROP = /(?:drops?|leaves?\s+behind|abandons?|puts?\s+down)\s+(?:the\s+|a\s+|an\s+)?[""']?([A-Za-z\s]+?)[""']?/i;

// ── Lore Update Patterns ──────────────────────────────────────

/** Matches lore revelations: "reveals that", "discovers that", "uncovers", "unearths" */
export const LORE_REVELATION = /(?:reveals?\s+that|discover(?:s|ed)\s+that|learn(?:s|ed)\s+that|uncovers?|unearth(?:s|ed)|realiz(?:es?|ed)\s+that)/i;

/** Matches ancient lore references: "according to legend", "ancient texts", "old tales" */
export const LORE_ANCIENT = /(?:according\s+to\s+(?:legend|ancient|old)\s+(?:texts?|records?|tales?|scrolls?))/i;

// ── Aggregate Arrays ──────────────────────────────────────────

/** All location change patterns */
export const LOCATION_PATTERNS = [LOCATION_MOVEMENT, LOCATION_TRAVEL] as const;

/** All time advancement patterns */
export const TIME_PATTERNS = [TIME_HOURS, TIME_CELESTIAL, TIME_NEXT_PERIOD] as const;

/** All combat patterns */
export const COMBAT_PATTERNS = [COMBAT_ACTION, COMBAT_DAMAGE] as const;

/** All NPC state change patterns */
export const NPC_PATTERNS = [NPC_STATE, NPC_DISPOSITION, NPC_REVELATION] as const;

/** All item transfer patterns */
export const ITEM_PATTERNS = [ITEM_GIVE, ITEM_TAKE, ITEM_DROP] as const;

/** All lore update patterns */
export const LORE_PATTERNS = [LORE_REVELATION, LORE_ANCIENT] as const;
