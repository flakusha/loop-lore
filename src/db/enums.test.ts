/**
 * Enum barrel validation tests.
 *
 * Ensures all expected enum exports are present in the barrel
 * and that their values are non-empty strings. Prevents drift
 * between domain enum files and the barrel re-export.
 */
import { describe, expect, test } from "bun:test";
import * as enums from "./enums";

// ── Expected enum exports per domain ────────────────────────
const EXPECTED_ENUMS: Record<string, string[]> = {
  // enums-core
  UserRole: ["admin", "user", "viewer", "solo"],
  UserStatus: ["active", "disabled", "deactivated"],
  ChatType: ["direct", "group"],
  ChatMode: ["direct", "group", "story"],
  ChatPurpose: ["main", "side", "notes"],
  TurnStrategy: ["round_robin", "scene_based", "initiative", "quest_driven", "hybrid"],
  ActorType: ["user", "character", "narrator", "system"],
  AgentType: ["none", "ai", "narrator", "npc"],
  ChatParticipantRole: ["member", "owner", "observer"],
  MessageRole: ["user", "assistant", "character", "system"],
  MessageContentType: ["text", "action", "narration", "system", "continuation"],
  MessageContentFormat: ["markdown"],
  MessageStatus: ["sending", "confirmed", "failed", "partial", "rejected", "cancelled"],
  MessageVisibility: ["visible", "hidden_by_user", "hidden_by_moderator", "auto_hidden", "redacted"],
  ActorVisibility: ["private", "public"],
  PinnedState: ["unpinned", "pinned", "archived"],
  DefaultState: ["not_default", "default"],
  EquipState: ["unequipped", "equipped"],
  StackableState: ["unique", "stackable"],
  KeyType: ["signing", "encryption", "symmetric", "master", "primary"],
  KeyStatus: ["active", "expired", "revoked"],
  NoteCategory: ["general", "world", "character", "story", "combat", "session"],
  ActorItemType: ["equipment", "consumable", "key_item", "artifact", "misc"],
  ModelRole: ["main", "captioning", "moderation", "embeddings", "summarization"],
  // enums-story
  TurnType: ["character_action", "narration", "gm_injection", "quest_update", "world_event"],
  TurnStatus: ["pending", "generating", "evaluating", "accepted", "regenerating", "failed", "escalated"],
  QuestType: ["time", "collection", "destruction", "rescue", "discovery", "social", "composite"],
  QuestStatus: ["active", "completed", "failed", "abandoned"],
  QuestProgressStatus: ["active", "completed", "failed", "ignored"],
  MemoryType: ["episodic", "semantic", "procedural"],
  LorePosition: ["before_char", "after_char", "in_char"],
  LoreEntryStatus: ["enabled", "disabled", "archived"],
  ItemCategory: [
    "weapon",
    "armor",
    "consumable",
    "key_item",
    "quest_item",
    "material",
    "tool",
    "container",
    "treasure",
    "book",
    "other",
  ],
  ItemRarity: ["common", "uncommon", "rare", "epic", "legendary", "unique"],
  ItemVisibility: ["visible", "hidden"],
  // enums-content
  ContentEncoding: ["identity", "gzip", "zstd", "brotli"],
  // enums-config
  DbType: ["sqlite", "postgres"],
  LogLevel: ["debug", "info", "warn", "error"],
  AgeGateMode: ["none", "self-declaration", "verification"],
};

describe("enum barrel", () => {
  for (const [name, expectedValues] of Object.entries(EXPECTED_ENUMS)) {
    test(`${name} exports expected values`, () => {
      const enumObj = (enums as any)[name];
      expect(enumObj).toBeDefined();
      const actualValues = Object.values(enumObj as Record<string, string>);
      expect(actualValues.sort()).toEqual([...expectedValues].sort());
    });
  }

  test("all expected enums are present in barrel", () => {
    const expectedNames = Object.keys(EXPECTED_ENUMS).sort();
    const actualNames = Object.keys(enums).filter(
      (k) =>
        !k.endsWith("Machine")
        && !k.endsWith("Def")
        && !k.endsWith("Validator")
        && k !== "StateMachine"
        && k !== "TransitionError"
        && k !== "CompositeValidator"
        && k !== "createMachine"
        && k !== "StateDef",
    );
    // Check that expected names are subset of actual names
    for (const name of expectedNames) {
      expect(actualNames).toContain(name);
    }
  });
});
