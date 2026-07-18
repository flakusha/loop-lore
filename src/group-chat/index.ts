/**
 * Group Chat Module — Barrel
 *
 * Group-chat-specific turn selection, @mention parsing,
 * and (later) side-chat management.
 */

// ── Turn Selection ─────────────────────────────────────────
export { selectNextGroupActor, type TurnSelectorOptions } from "./turn-selector";

// ── Mention Parsing ────────────────────────────────────────
export {
  parseMentions,
  resolveMention,
  extractMentionedActorIds,
  parseInitiativeFlag,
  type ParsedMention,
} from "./mention-parser";
