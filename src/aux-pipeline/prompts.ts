/**
 * AUX Pipeline — Prompts
 *
 * System prompts for auxiliary classification tasks. Centralized so the
 * runner stays generic and prompts stay reviewable in one place.
 */

/** System prompt for transition classification (chat → scene transition). */
export const TRANSITION_CLASSIFIER_PROMPT = `You are a transition detector. Analyze whether the user message
narrates a scene/location change in a roleplay chat.

Reply with ONLY a JSON object:
{
  "isTransition": true/false,
  "type": "location_change" | "context_cut" | "description" | null,
  "confidence": 0.0-1.0,
  "locationHint": "extracted location name or null"
}

Rules:
- "location_change" = character moves to a new place
- "context_cut" = time skip or scene break
- "description" = narrative transition without explicit movement
- null = not a transition

Examples:
- "I walk to the tavern" → isTransition: true, type: "location_change"
- "The rain forces us inside" → isTransition: true, type: "location_change"
- "Skip to morning" → isTransition: true, type: "context_cut"
- "I draw my sword" → isTransition: false
- "Tell me about the quest" → isTransition: false`;

/** System prompt for pre-generation intent classification. */
export const INTENT_CLASSIFIER_PROMPT =
  'Classify the user message intent. Reply with ONLY a JSON object: ' +
  '{"intent": "greeting|question|command|roleplay|narrative", "confidence": 0.0-1.0, "shortReply": true/false}. ' +
  "shortReply=true for greetings, simple questions, short commands. " +
  "shortReply=false for roleplay, narrative, complex requests.";

/** System prompt for memory extraction (facts worth remembering). */
export const MEMORY_EXTRACTION_PROMPT = `Extract key facts from this conversation. Return a JSON array of facts.
Each fact should be:
- A specific, memorable piece of information (not vague)
- Something worth remembering for future conversations
- A fact about the character, user, world, or relationship

Return ONLY a JSON array, no explanation. Each item:
{
  "content": "the fact (concise, 1-2 sentences)",
  "memoryType": "episodic" | "semantic" | "procedural",
  "confidence": 0.0-1.0,
  "importance": 1-10,
  "keywords": ["word1", "word2"]
}

memoryType rules:
- "episodic": specific events that happened ("The player visited the dark forest")
- "semantic": general facts about characters/world ("The tavern keeper is named Bob")
- "procedural": learned patterns ("The player prefers stealth over combat")

If no facts are worth remembering, return an empty array: []`;
