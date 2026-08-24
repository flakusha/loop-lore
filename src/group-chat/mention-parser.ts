// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mention Parser — @mention extraction from message text
 *
 * Parses @ActorName or @DisplayName mentions from user messages.
 * Used by the turn-selector to override turn strategy when a specific
 * actor is mentioned.
 *
 * Design: Simple regex-based extraction. No DB access in the parser itself —
 * the caller resolves names to actor IDs.
 */
import { getLogger, type Logger, } from "../logger";

const log: Logger = new Proxy({} as Logger, {
  get(_target, prop,) {
    const instance = getLogger().child({ module: "mention-parser", },);
    return Reflect.get(instance, prop,);
  },
},);

/** Parsed mention result */
export interface ParsedMention {
  /** The raw mention text (e.g., "@Luna") */
  raw: string;
  /** The display name portion (e.g., "Luna") */
  name: string;
  /** Character index range in the original message */
  start: number;
  end: number;
}

/**
 * Extract @mentions from a message string.
 *
 * Matches patterns like:
 * - @Luna
 * - @Luna hello
 * - @Luna, @Max hello
 *
 * @param text - User message content
 * @returns Array of parsed mentions (may be empty)
 */
export function parseMentions(text: string,): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  // Match @ followed by a name (alphanumeric, underscore, hyphen, spaces)
  const mentionRegex = /@([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*)/g;
  let match = mentionRegex.exec(text,);

  while (match !== null) {
    mentions.push({
      raw: match[0],
      name: match[1]!,
      start: match.index,
      end: match.index + match[0].length,
    },);
    match = mentionRegex.exec(text,);
  }

  if (mentions.length > 0) {
    log.debug("Parsed mentions", { count: mentions.length, names: Array.from(mentions, (m,) => m.name,), },);
  }

  return mentions;
}

/**
 * Resolve a parsed mention name to an actor ID.
 *
 * Case-insensitive match against participant display names. The exact match
 * (case-insensitive) wins outright. If no exact match, the mention is treated
 * as a prefix and matched against display names; when more than one
 * participant shares the prefix the resolution is ambiguous and `null` is
 * returned so the caller can surface a system message asking the user to
 * disambiguate (e.g. `@Lun#` or the full display name). When ambiguity is not
 * triggered the prefix match is deterministic: participants are ordered by
 * `actorId` lexicographically before scanning.
 *
 * @param name - Mention name to resolve (empty string returns null)
 * @param participants - Available participants [{actorId, displayName}]
 * @returns Matching actor ID, or null if no match / ambiguous prefix
 */
export function resolveMention(
  name: string,
  participants: { actorId: string; displayName: string }[],
): string | null {
  const lower = name.toLowerCase();
  if (lower.length === 0) { return null; }

  // Exact match first (case-insensitive)
  const exact = participants.find((p,) => p.displayName.toLowerCase() === lower);
  if (exact) { return exact.actorId; }

  // Stable order by actorId so prefix-match selection is deterministic when
  // no ambiguity exists.
  const ordered = [...participants].sort((a, b,) => a.actorId.localeCompare(b.actorId,));

  // Prefix match — count matches; >1 is ambiguous.
  const prefixMatches = ordered.filter((p,) => p.displayName.toLowerCase().startsWith(lower,));
  if (prefixMatches.length === 1) { return prefixMatches[0]!.actorId; }

  return null;
}

/**
 * Extract all mentioned actor IDs from a message.
 *
 * @param text - User message content
 * @param participants - Available participants [{actorId, displayName}]
 * @returns Array of mentioned actor IDs (may be empty)
 */
export function extractMentionedActorIds(
  text: string,
  participants: { actorId: string; displayName: string }[],
): string[] {
  const mentions = parseMentions(text,);
  const ids: string[] = [];

  for (const mention of mentions) {
    const id = resolveMention(mention.name, participants,);
    if (id) { ids.push(id,); }
  }

  return [...new Set(ids,),];
}

/**
 * Detect initiative claim prefix (>>).
 * Returns { isInitiative: true, cleanMessage: string } if prefixed.
 */
export function parseInitiativeFlag(input: string,): { isInitiative: boolean; cleanMessage: string } {
  const trimmed = input.trim();
  if (trimmed.startsWith(">>",)) {
    const cleanMessage = trimmed.slice(2,).trim();
    return { isInitiative: true, cleanMessage, };
  }
  return { isInitiative: false, cleanMessage: trimmed, };
}
