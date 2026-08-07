/**
 * Chat Auto-Renaming
 *
 * Generates descriptive chat names from conversation content.
 * Two strategies: rule-based (v1) and LLM-based (v2).
 *
 * Rule-based: extracts character name + location/topic from first messages.
 * LLM-based: sends first 3-5 messages to LLM with rename prompt.
 */

// ─── Types ────────────────────────────────────────────────────

export interface RenameResult {
  name: string;
  source: "manual" | "auto-rule" | "auto-llm";
}

// ─── Rule-Based Rename ────────────────────────────────────────

/**
 * Generate a chat name using rule-based heuristics.
 *
 * Strategy: "{CharacterName} — {Topic}" or "{CharacterName} — {Location}"
 *
 * @param characterName - Name of the AI character in the chat
 * @param locationName - Current location name (if world-linked)
 * @param firstUserMessage - First user message for topic extraction
 * @returns Generated name (max 60 chars)
 */
export function generateRuleName(
  characterName: string,
  locationName: string | null,
  firstUserMessage: string | null,
): RenameResult {
  const parts: string[] = [];

  if (characterName) {
    parts.push(truncate(characterName, 25,),);
  }

  if (locationName) {
    parts.push(truncate(locationName, 25,),);
  } else if (firstUserMessage) {
    const topic = extractTopic(firstUserMessage,);
    if (topic) {
      parts.push(truncate(topic, 25,),);
    }
  }

  const name = parts.length > 0
    ? parts.join(" — ",)
    : "New Chat";

  return { name: truncate(name, 60,), source: "auto-rule", };
}

// ─── LLM-Based Rename ─────────────────────────────────────────

/**
 * Build a prompt for LLM-based chat renaming.
 *
 * @param characterName - Character name for context
 * @param messages - First 3-5 messages (content only)
 * @returns Prompt string for the LLM
 */
export function buildRenamePrompt(
  characterName: string,
  messages: string[],
): string {
  const lines = Array.from(messages, (m, i,) => `${i % 2 === 0 ? "User" : characterName}: ${m}`,);
  const messageBlock = lines.join("\n",);

  return `Generate a short, descriptive chat title (max 40 characters) for this conversation. Include the character name and the main topic. Do not use quotes or punctuation at the end.

Character: ${characterName}
Messages:
${messageBlock}

Title:`;
}

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Extract a topic phrase from a user message.
 *
 * Takes the first N words as the topic, filtering out common
 * filler phrases.
 */
function extractTopic(message: string,): string | null {
  const cleaned = message
    .replace(/^(hey|hi|hello|yo|sup|what's up|so|well|um|uh|like)\s*/i, "",)
    .trim();

  if (!cleaned) { return null; }

  // Take first 4-6 words as topic
  const words = cleaned.split(/\s+/,).slice(0, 5,);
  return words.join(" ",);
}

/**
 * Truncate a string to maxLen, adding "…" if truncated.
 */
function truncate(s: string, maxLen: number,): string {
  if (s.length <= maxLen) { return s; }
  return `${s.slice(0, maxLen - 1,)}…`;
}
