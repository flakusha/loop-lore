/**
 * Enum barrel validation tests.
 *
 * Ensures all expected enum exports are present in the barrel
 * and that their values are non-empty strings. Prevents drift
 * between domain enum files and the barrel re-export.
 */
import { describe, expect, test, } from "bun:test";
import * as enums from "./enums";

// ── State machine behavior ──────────────────────────────────

import { questProgressStatusMachine, questProgressValidator, questStatusMachine, } from "./enums-story/quests";
import { turnStatusMachine, } from "./enums-story/turns";

// ── Expected enum exports per domain ────────────────────────
const EXPECTED_ENUMS: Record<string, string[]> = {
  // enums-core
  UserRole: [
    "admin",
    "moderator",
    "user",
    "creator",
    "player",
    "viewer",
    "guest",
    "bot",
    "tester",
    "custom",
    "solo",
  ],
  UserStatus: ["active", "disabled", "deactivated",],
  ChatType: ["direct", "group",],
  ChatMode: ["direct", "group", "story",],
  ChatPurpose: ["main", "side", "notes",],
  TurnStrategy: ["round_robin", "scene_based", "initiative", "quest_driven", "hybrid",],
  ActorType: ["user", "character", "narrator", "system",],
  AgentType: ["none", "ai", "narrator", "npc",],
  ChatParticipantRole: ["member", "owner", "observer",],
  MessageRole: ["user", "assistant", "character", "system",],
  MessageContentType: ["text", "action", "narration", "system", "continuation",],
  MessageContentFormat: ["markdown",],
  MessageStatus: ["sending", "confirmed", "failed", "partial", "rejected", "cancelled",],
  MessageVisibility: ["visible", "hidden_by_user", "hidden_by_moderator", "auto_hidden", "redacted",],
  ActorVisibility: ["private", "public",],
  PinnedState: ["unpinned", "pinned", "archived",],
  DefaultState: ["not_default", "default",],
  EquipState: ["unequipped", "equipped",],
  StackableState: ["unique", "stackable",],
  KeyType: ["signing", "encryption", "symmetric", "master", "primary",],
  KeyStatus: ["active", "expired", "revoked",],
  NoteCategory: ["general", "world", "character", "story", "combat", "session",],
  ModelRole: ["main", "auxiliary", "captioning", "moderation", "embeddings", "summarization",],
  // enums-story
  TurnType: ["character_action", "narration", "gm_injection", "quest_update", "world_event",],
  TurnStatus: ["pending", "generating", "evaluating", "accepted", "regenerating", "failed", "escalated",],
  QuestType: ["time", "collection", "destruction", "rescue", "discovery", "social", "composite",],
  QuestStatus: ["active", "completed", "failed", "abandoned",],
  QuestProgressStatus: ["active", "completed", "failed", "ignored",],
  MemoryType: ["episodic", "semantic", "procedural",],
  LorePosition: ["before_char", "after_char", "in_char",],
  LoreEntryStatus: ["enabled", "disabled", "archived",],
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
    "artifact",
    "misc",
    "other",
  ],
  ItemRarity: ["common", "uncommon", "rare", "epic", "legendary", "unique", "artifact",],
  ItemVisibility: ["visible", "hidden",],
  // enums-content
  ContentEncoding: ["identity", "gzip", "zstd", "brotli",],
  // enums-config
  DbType: ["sqlite", "postgres",],
  LogLevel: ["trace", "debug", "info", "warn", "error", "fatal",],
  AgeGateMode: ["none", "self-declaration", "verification",],
};

describe("enum barrel", () => {
  for (const [name, expectedValues,] of Object.entries(EXPECTED_ENUMS,)) {
    test(`${name} exports expected values`, () => {
      const enumObj = (enums as any)[name];
      expect(enumObj,).toBeDefined();
      const actualValues = Object.values(enumObj as Record<string, string>,);
      expect(actualValues.sort((a, b,) => a.localeCompare(b,)),).toEqual(
        [...expectedValues,].sort((a, b,) => a.localeCompare(b,)),
      );
    });
  }

  test("all expected enums are present in barrel", () => {
    const expectedNames = Object.keys(EXPECTED_ENUMS,).sort((a, b,) => a.localeCompare(b,));
    const actualNames = Object.keys(enums,).filter(
      (k,) =>
        !k.endsWith("Machine",) &&
        !k.endsWith("Def",) &&
        !k.endsWith("Validator",) &&
        k !== "StateMachine" &&
        k !== "TransitionError" &&
        k !== "CompositeValidator" &&
        k !== "createMachine" &&
        k !== "StateDef",
    );
    // Check that expected names are subset of actual names
    for (const name of expectedNames) {
      expect(actualNames,).toContain(name,);
    }
  });
});

describe("questStatusMachine", () => {
  test("initial state is active", () => {
    expect(questStatusMachine.def.initial,).toBe("active",);
  });

  test("active transitions to all non-terminal states", () => {
    for (const to of ["completed", "failed", "abandoned",] as const) {
      expect(questStatusMachine.canTransition("active", to,),).toBe(true,);
    }
  });

  test("terminal states reject re-transition", () => {
    expect(questStatusMachine.canTransition("completed", "active",),).toBe(false,);
    expect(questStatusMachine.canTransition("failed", "completed",),).toBe(false,);
  });

  test("abandoned quests can be re-activated", () => {
    expect(questStatusMachine.canTransition("abandoned", "active",),).toBe(true,);
  });
});

describe("questProgressValidator", () => {
  test("accepts the legal quest/progress pairs", () => {
    expect(questProgressValidator.isValid("active", "active",),).toBe(true,);
    expect(questProgressValidator.isValid("abandoned", "ignored",),).toBe(true,);
    expect(questProgressValidator.isValid("failed", "failed",),).toBe(true,);
    expect(questProgressValidator.isValid("completed", "completed",),).toBe(true,);
  });

  test("rejects mismatched pairs", () => {
    expect(questProgressValidator.isValid("active", "completed",),).toBe(false,);
    expect(questProgressValidator.isValid("failed", "active",),).toBe(false,);
  });
});

describe("questProgressStatusMachine", () => {
  test("initial state is active", () => {
    expect(questProgressStatusMachine.def.initial,).toBe("active",);
  });

  test("ignored progress can return to active", () => {
    expect(questProgressStatusMachine.canTransition("ignored", "active",),).toBe(true,);
  });
});

describe("turnStatusMachine", () => {
  test("initial state is pending", () => {
    expect(turnStatusMachine.def.initial,).toBe("pending",);
  });

  test("pending turns can be accepted directly", () => {
    expect(turnStatusMachine.canTransition("pending", "accepted",),).toBe(true,);
  });

  test("generation flows through evaluating", () => {
    expect(turnStatusMachine.canTransition("pending", "generating",),).toBe(true,);
    expect(turnStatusMachine.canTransition("generating", "evaluating",),).toBe(true,);
    expect(turnStatusMachine.canTransition("evaluating", "accepted",),).toBe(true,);
  });

  test("accepted and escalated are terminal", () => {
    expect(turnStatusMachine.canTransition("accepted", "pending",),).toBe(false,);
    expect(turnStatusMachine.canTransition("escalated", "accepted",),).toBe(false,);
  });
});
