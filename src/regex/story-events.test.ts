import { describe, expect, it } from "bun:test";
import {
  LOCATION_MOVEMENT,
  LOCATION_TRAVEL,
  LOCATION_PATTERNS,
  TIME_HOURS,
  TIME_CELESTIAL,
  TIME_NEXT_PERIOD,
  TIME_PATTERNS,
  COMBAT_ACTION,
  COMBAT_DAMAGE,
  COMBAT_PATTERNS,
  NPC_STATE,
  NPC_DISPOSITION,
  NPC_REVELATION,
  NPC_PATTERNS,
  ITEM_GIVE,
  ITEM_TAKE,
  ITEM_DROP,
  ITEM_PATTERNS,
  LORE_REVELATION,
  LORE_ANCIENT,
  LORE_PATTERNS,
} from "./story-events";

describe("story-events regex", () => {
  // ── Location Patterns ────────────────────────────────────

  describe("LOCATION_MOVEMENT", () => {
    it("matches enters", () => {
      expect(LOCATION_MOVEMENT.test("He enters the tavern.")).toBe(true);
    });

    it("matches moves to", () => {
      expect(LOCATION_MOVEMENT.test("She moves to the forest.")).toBe(true);
    });

    it("matches arrives at", () => {
      expect(LOCATION_MOVEMENT.test("They arrives at the castle.")).toBe(true);
    });

    it("matches steps into", () => {
      expect(LOCATION_MOVEMENT.test("He steps into the cave.")).toBe(true);
    });

    it("matches walks into", () => {
      expect(LOCATION_MOVEMENT.test("She walks into the room.")).toBe(true);
    });

    it("matches goes to", () => {
      expect(LOCATION_MOVEMENT.test("They goes to the market.")).toBe(true);
    });

    it("matches heads toward", () => {
      expect(LOCATION_MOVEMENT.test("He heads toward the gate.")).toBe(true);
    });

    it("matches leaves the", () => {
      expect(LOCATION_MOVEMENT.test("She leaves the building.")).toBe(true);
    });

    it("does not match unrelated text", () => {
      expect(LOCATION_MOVEMENT.test("The weather is nice today.")).toBe(false);
    });
  });

  describe("LOCATION_TRAVEL", () => {
    it.each([
      ["She makes their way to the village.", "the village"],
      ["They travel to the mountains.", "the mountains"],
      ["He ventures into the dungeon.", "the dungeon"],
      ["She makes their way towards the palace.", "the palace"],
    ])("matches %s → captures %s", (input, expected) => {
      expect(LOCATION_TRAVEL.exec(input)?.[1]).toBe(expected);
    });
  });

  describe("LOCATION_PATTERNS", () => {
    it("has 2 patterns", () => {
      expect(LOCATION_PATTERNS.length).toBe(2);
    });

    it.each([
      ["He enters the tavern.", "tavern"],
      ["She makes their way to the village.", "village"],
    ])("matches %s via aggregate", (input) => {
      const matched = LOCATION_PATTERNS.some((p) => p.test(input));
      expect(matched).toBe(true);
    });
  });

  // ── Time Patterns ────────────────────────────────────────

  describe("TIME_HOURS", () => {
    it.each([
      "Hours pass slowly.",
      "Later that evening, they arrived.",
      "After a few hours, the sun set.",
      "By a few hours, the battle was over.",
    ])("matches '%s'", (input) => {
      expect(TIME_HOURS.test(input)).toBe(true);
    });
  });

  describe("TIME_CELESTIAL", () => {
    it.each([
      "The sun rises over the horizon.",
      "The moon sets behind the hills.",
      "Dawn breaks across the valley.",
      "Dusk settles over the land.",
      "Night falls upon the city.",
    ])("matches '%s'", (input) => {
      expect(TIME_CELESTIAL.test(input)).toBe(true);
    });
  });

  describe("TIME_NEXT_PERIOD", () => {
    it.each([
      "The next day, they set out.",
      "A week later, the letter arrived.",
      "A month later, everything changed.",
      "The next morning, she awoke.",
    ])("matches '%s'", (input) => {
      expect(TIME_NEXT_PERIOD.test(input)).toBe(true);
    });
  });

  describe("TIME_PATTERNS", () => {
    it("has 3 patterns", () => {
      expect(TIME_PATTERNS.length).toBe(3);
    });
  });

  // ── Combat Patterns ──────────────────────────────────────

  describe("COMBAT_ACTION", () => {
    it.each([
      "He strikes the enemy.",
      "She hits the shield.",
      "They slashes at the foe.",
      "He attacks the dragon.",
      "She fires at the target.",
    ])("matches '%s'", (input) => {
      expect(COMBAT_ACTION.test(input)).toBe(true);
    });
  });

  describe("COMBAT_DAMAGE", () => {
    it.each([
      "She takes 5 damage from the attack.",
      "He loses 10 hp.",
      "Health drops to 3.",
      "He takes 20 hits.",
    ])("matches '%s'", (input) => {
      expect(COMBAT_DAMAGE.test(input)).toBe(true);
    });
  });

  describe("COMBAT_PATTERNS", () => {
    it("has 2 patterns", () => {
      expect(COMBAT_PATTERNS.length).toBe(2);
    });
  });

  // ── NPC Patterns ─────────────────────────────────────────

  describe("NPC_STATE", () => {
    it.each([
      "The guard looks calm.",
      "She looks afraid of the monster.",
      "He looks angry.",
      "They look suspicious.",
    ])("matches '%s'", (input) => {
      expect(NPC_STATE.test(input)).toBe(true);
    });
  });

  describe("NPC_DISPOSITION", () => {
    it.each([
      "She becomes more friendly over time.",
      "He becomes less hostile.",
      "They become more trusting.",
    ])("matches '%s'", (input) => {
      expect(NPC_DISPOSITION.test(input)).toBe(true);
    });
  });

  describe("NPC_REVELATION", () => {
    it.each([
      "She reveals that she knows the secret.",
      "He confesses that he has the key.",
      "She admits that she discovered the truth.",
    ])("matches '%s'", (input) => {
      expect(NPC_REVELATION.test(input)).toBe(true);
    });
  });

  describe("NPC_PATTERNS", () => {
    it("has 3 patterns", () => {
      expect(NPC_PATTERNS.length).toBe(3);
    });
  });

  // ── Item Patterns ────────────────────────────────────────

  describe("ITEM_GIVE", () => {
    it("matches gives", () => {
      expect(ITEM_GIVE.test("He gives the sword to the knight.")).toBe(true);
    });

    it("matches hands", () => {
      expect(ITEM_GIVE.test("She hands a potion to the healer.")).toBe(true);
    });

    it("matches offers", () => {
      expect(ITEM_GIVE.test("They offer the key to the guard.")).toBe(true);
    });
  });

  describe("ITEM_TAKE", () => {
    it("matches takes", () => {
      expect(ITEM_TAKE.test("He takes the key from the table.")).toBe(true);
    });

    it("matches picks up", () => {
      expect(ITEM_TAKE.test("She picks up a scroll.")).toBe(true);
    });

    it("matches find", () => {
      expect(ITEM_TAKE.test("They find a hidden gem.")).toBe(true);
    });

    it("matches collects", () => {
      expect(ITEM_TAKE.test("He collects the bounty.")).toBe(true);
    });
  });

  describe("ITEM_DROP", () => {
    it("matches drops", () => {
      const match = ITEM_DROP.exec("He drops the broken sword.");
      expect(match).not.toBeNull();
    });

    it("matches leaves behind", () => {
      expect(ITEM_DROP.test("She leaves behind a note.")).toBe(true);
    });

    it("matches abandons", () => {
      expect(ITEM_DROP.test("They abandon the cart.")).toBe(true);
    });

    it("matches puts down", () => {
      expect(ITEM_DROP.test("He puts down the shield.")).toBe(true);
    });
  });

  describe("ITEM_PATTERNS", () => {
    it("has 3 patterns", () => {
      expect(ITEM_PATTERNS.length).toBe(3);
    });
  });

  // ── Lore Patterns ────────────────────────────────────────

  describe("LORE_REVELATION", () => {
    it.each([
      "She reveals that the artifact is cursed.",
      "He discovers that the map leads nowhere.",
      "They learned that the prophecy was false.",
      "She uncovers the ancient truth.",
      "He realizes that the ally was a traitor.",
    ])("matches '%s'", (input) => {
      expect(LORE_REVELATION.test(input)).toBe(true);
    });
  });

  describe("LORE_ANCIENT", () => {
    it.each([
      "According to legend texts, the dragon was slain.",
      "According to ancient texts, a hidden realm exists.",
      "According to old tales, the kingdom fell.",
      "According to ancient scrolls, the recipe is lost.",
    ])("matches '%s'", (input) => {
      expect(LORE_ANCIENT.test(input)).toBe(true);
    });

    it("does not match without 'according to' prefix", () => {
      expect(LORE_ANCIENT.test("Ancient texts speak of a hidden realm.")).toBe(false);
    });
  });

  describe("LORE_PATTERNS", () => {
    it("has 2 patterns", () => {
      expect(LORE_PATTERNS.length).toBe(2);
    });
  });
});
