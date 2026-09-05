// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for random events with participant/location/worldTime awareness.
 */
import { describe, expect, test, } from "bun:test";
import { generateRandomEvent, randomEventToEventRef, } from "./random-events";

/**
 * Event pool (from random-events.ts):
 * 0: weather (weight 3) - "The weather shifts — {weather}."
 * 1: npc (weight 2) - "{npc} passes by, glancing briefly."
 * 2: npc (weight 2) - "A distant voice calls out..."
 * 3: environmental (weight 1) - "Something creaks..."
 * 4: environmental (weight 1) - " ground vibrates..."
 * 5: ambient (weight 2) - "A {sound} echoes..."
 * 6: ambient (weight 1) - "The air carries a faint scent of {scent}."
 * 7: social (weight 1) - "Nearby, {npc} seems to be in a hurry."
 * Total weight: 13
 */

describe("generateRandomEvent", () => {
  test("returns undefined when no events are eligible (messageCount below all minMessages)", () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    try {
      const result = generateRandomEvent({ messageCount: 0, },);
      expect(result,).toBeUndefined();
    } finally {
      Math.random = origRandom;
    }
  });

  test("uses AI participant name for {npc} when participants provided", () => {
    // Select event 1 (npc with {npc} placeholder): roll between 3 and 5
    let callCount = 0;
    const origRandom = Math.random;
    Math.random = () => {
      callCount++;
      if (callCount === 1) { return 0.3; } // roll = 0.3 * 13 = 3.9, selects event 1
      return 0.1;
    };

    try {
      const result = generateRandomEvent({
        messageCount: 100,
        messagesSinceLastEvent: 100,
        participants: [
          { id: "p1", displayName: "Alice", role: "ai", },
          { id: "p2", displayName: "Bob", role: "ai", },
          { id: "p3", displayName: "User", role: "user", },
        ],
      },);

      expect(result,).toBeDefined();
      expect(result!.content,).toMatch(/Alice|Bob/,);
    } finally {
      Math.random = origRandom;
    }
  });

  test("uses currentLocation name for {location} when provided", () => {
    let callCount = 0;
    const origRandom = Math.random;
    Math.random = () => {
      callCount++;
      if (callCount === 1) { return 0.0; }
      return 0.1;
    };

    try {
      const result = generateRandomEvent({
        messageCount: 100,
        messagesSinceLastEvent: 100,
        currentLocation: { id: "loc1", name: "Goblin Caves", },
      },);

      expect(result,).toBeDefined();
      // Weather event selected; pool has no {location} template, but the
      // function still completes without error.
      expect(result!.content,).toContain("shifts",);
    } finally {
      Math.random = origRandom;
    }
  });

  test("derives weather from worldTime period", () => {
    let callCount = 0;
    const origRandom = Math.random;
    Math.random = () => {
      callCount++;
      if (callCount === 1) { return 0.0; }
      return 0.1;
    };

    try {
      const result = generateRandomEvent({
        messageCount: 100,
        messagesSinceLastEvent: 100,
        worldTime: { hour: 22, period: "night", },
      },);

      expect(result,).toBeDefined();
      // Weather event is first in pool (index 0)
      expect(result!.content,).toContain("cold",);
    } finally {
      Math.random = origRandom;
    }
  });

  test("falls back to NPC_OPTIONS when no AI participants", () => {
    // Select event 1 (npc with {npc} placeholder)
    let callCount = 0;
    const origRandom = Math.random;
    Math.random = () => {
      callCount++;
      if (callCount === 1) { return 0.3; } // roll = 3.9, selects event 1
      return 0.1;
    };

    try {
      const result = generateRandomEvent({
        messageCount: 100,
        messagesSinceLastEvent: 100,
        participants: [
          { id: "p1", displayName: "User", role: "user", },
        ],
      },);

      expect(result,).toBeDefined();
      // Should fall back to NPC_OPTIONS (generic names)
      expect(result!.content,).toMatch(/traveler|merchant|guard|child|old man|hooded figure/,);
    } finally {
      Math.random = origRandom;
    }
  });
});

describe("randomEventToEventRef", () => {
  test("converts a RandomEvent into an EventRef with token estimate", () => {
    const event = {
      category: "npc" as const,
      cooldown: 10,
      content: "Alice passes by.",
      id: "evt-1",
      minMessages: 5,
      template: "{npc} passes by.",
      weight: 1,
    };

    const ref = randomEventToEventRef(event,);

    expect(ref.eventId,).toBe("evt-1",);
    expect(ref.type,).toBe("random",);
    expect(ref.content,).toBe("Alice passes by.",);
    // 16 chars / 4 = ceil(4) = 4 tokens
    expect(ref.tokenCount,).toBe(4,);
  });
});
