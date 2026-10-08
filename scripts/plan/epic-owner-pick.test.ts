// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the epic owner-picking rule.
 *
 * The load-bearing invariants: the FIRST resolvable candidate wins (prior
 * passes collapsed to the first epic; the rule codifies that); an
 * ambiguous or unresolvable value resolves to null and is reported, never
 * guessed; an already-canonical slug passes through unchanged.
 */
import { describe, expect, test, } from "bun:test";
import { pickEpicOwner, scanEpicTitles, splitEpicCandidates, } from "./epic-owner-pick";

const SLUGS = new Set([
  "epic-chat-lifecycle-moderation",
  "epic-assistant-gm-flows",
  "epic-housing",
  "epic-housing-base-building",
  "epic-character-core-system",
  "epic-immersion-presentation",
  "epic-visual-novel-mode",
  "epic-aux-enrichment-pipeline",
  "epic-avatar-alpha-vn-layering",
],);
const TITLES: Record<string, string> = {
  "Character Core System": "epic-character-core-system",
  "Immersion & Presentation": "epic-immersion-presentation",
  "Avatar Alpha Channel + VN Layering": "epic-avatar-alpha-vn-layering",
};

describe("splitEpicCandidates", () => {
  test("comma list splits in author order", () => {
    expect(splitEpicCandidates("epic-assistant-gm-flows, epic-chat-lifecycle-moderation",),)
      .toEqual(["epic-assistant-gm-flows", "epic-chat-lifecycle-moderation",],);
  });

  test("slash list splits; slash inside parens does not", () => {
    expect(splitEpicCandidates("epic-housing (umbrella) / epic-housing-base-building (design)",),)
      .toEqual(["epic-housing", "epic-housing-base-building",],);
    expect(splitEpicCandidates("Asset Platform Capabilities (Messenger/Social Patterns)",),)
      .toEqual(["Asset Platform Capabilities",],);
  });

  test("semicolon splits; .md suffix and backticks strip", () => {
    expect(splitEpicCandidates("`epic-logging-telemetry.md` (logging), `epic-aux-enrichment-pipeline.md` (storage)",),)
      .toEqual(["epic-logging-telemetry", "epic-aux-enrichment-pipeline",],);
    expect(splitEpicCandidates("Emotion Avatar Message Binding; Visual Novel Mode",),)
      .toEqual(["Emotion Avatar Message Binding", "Visual Novel Mode",],);
  });

  test("`+` joins candidates only with parenthetical role notes", () => {
    expect(splitEpicCandidates("epic-a.md (research) + epic-b.md (impl)",),)
      .toEqual(["epic-a", "epic-b",],);
    expect(splitEpicCandidates("Avatar Alpha Channel + VN Layering",),)
      .toEqual(["Avatar Alpha Channel + VN Layering",],);
  });
});

describe("pickEpicOwner", () => {
  test("first existing slug wins", () => {
    expect(pickEpicOwner(
      "epic-assistant-gm-flows, epic-chat-lifecycle-moderation",
      SLUGS,
      TITLES,
    ),).toBe("epic-assistant-gm-flows",);
    expect(pickEpicOwner(
      "epic-chat-lifecycle-moderation, epic-assistant-gm-flows",
      SLUGS,
      TITLES,
    ),).toBe("epic-chat-lifecycle-moderation",);
  });

  test("skips a dangling first candidate for the first that resolves", () => {
    expect(pickEpicOwner("epic-missing, epic-housing", SLUGS, TITLES,),).toBe("epic-housing",);
  });

  test("exact legacy title resolves; near-miss does not", () => {
    expect(pickEpicOwner("Character Core System", SLUGS, TITLES,),).toBe("epic-character-core-system",);
    // `Avatar Alpha Channel + VN Layering` split on `+`? No — `+` is not a
    // separator, so the whole title matches exactly.
    expect(pickEpicOwner("Avatar Alpha Channel + VN Layering", SLUGS, TITLES,),)
      .toBe("epic-avatar-alpha-vn-layering",);
    // Case differs from the table entry: reported, never fuzz-matched.
    expect(pickEpicOwner("character core system", SLUGS, TITLES,),).toBeNull();
  });

  test("title/slug mix resolves through the table", () => {
    expect(pickEpicOwner(
      "Avatar Alpha Channel + VN Layering; Visual Novel Mode",
      SLUGS,
      TITLES,
    ),).toBe("epic-avatar-alpha-vn-layering",);
  });

  test("unresolvable values return null — reported, never guessed", () => {
    expect(pickEpicOwner("NPC/Actor System, NPC Navigation", SLUGS, TITLES,),).toBeNull();
    expect(pickEpicOwner("proposed:epic-3d-avatars", SLUGS, TITLES,),).toBeNull();
    expect(pickEpicOwner("Epic 26 (Avatar & Expression)", SLUGS, TITLES,),).toBeNull();
    expect(pickEpicOwner("(none)", SLUGS, TITLES,),).toBeNull();
    expect(pickEpicOwner("", SLUGS, TITLES,),).toBeNull();
  });

  test("already-canonical single slug passes through", () => {
    expect(pickEpicOwner("epic-housing", SLUGS, TITLES,),).toBe("epic-housing",);
  });
});

describe("scanEpicTitles", () => {
  test("reads both H1 dialects off disk", () => {
    const { titles, } = scanEpicTitles(".plan/epics",);
    expect(titles["Character Core System"],).toBe("epic-character-core-system",);
    // Legacy lowercase-`epic:` dialect.
    expect(titles["AO NSFW Game Mechanics"],).toBe("epic-nsfw-game-mechanics",);
    expect(Object.keys(titles,).length,).toBeGreaterThan(200,);
  });

  test("duplicate titles keep the first file and report the rest", () => {
    const { titles, ambiguous, } = scanEpicTitles(".plan/epics",);
    expect(ambiguous.length,).toBeGreaterThanOrEqual(1,);
    expect(titles["Internationalization (i18n)"],).toBe("epic-frontend-internationalization",);
  });
});
