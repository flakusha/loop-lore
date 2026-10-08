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
import path from "node:path";
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
  "epic-wardrobe-avatar-variants",
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

  test("whole-value exact title wins over splitting on its separator", () => {
    expect(pickEpicOwner("Wardrobe / Loadout Avatar Variants", SLUGS, {
      ...TITLES,
      "Wardrobe / Loadout Avatar Variants": "epic-wardrobe-avatar-variants",
    },),).toBe("epic-wardrobe-avatar-variants",);
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

/**
 * CLI surface of `bun run scripts/plan/epic-owner-pick.ts`.
 *
 * Resource contract — why this suite is parallel-safe:
 * - DISK: only the DEFAULT (no-flag) report path is spawned, which reads
 *   `.plan/tickets/index.json` and the tickets it names and writes nothing.
 *   `--apply` rewrites ticket `.md` files and index.json, and `--gen`
 *   overwrites `epic-titles.generated.ts` — a checked-in source file. Neither
 *   may be spawned here: both would race a sibling `bun test` process or a
 *   sibling agent over shared state. Their flag RECOGNITION is covered instead
 *   by the `--help` and unknown-option cases below.
 * - The reported owner/remainer COUNTS are not pinned to literals — how much
 *   multi-epic drift the tree holds is concurrent repo state. What is pinned is
 *   the `dry-run: true` banner, which proves `--apply` was not passed.
 * - PROCESS: each case is a spawned child, so the `import.meta.main` CLI block
 *   and its accumulators are per-invocation.
 * - No fixed-path fixtures, no shared globals, no ordering dependence.
 */
describe("epic-owner-pick CLI", () => {
  const SCRIPT = path.join(import.meta.dir, "epic-owner-pick.ts",);

  test("--help prints the brief and exits 0", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--help",],);
    expect(proc.exitCode,).toBe(0,);
    expect(proc.stdout.toString(),).toContain("Collapse multi-epic",);
  });

  test("the default mode is a dry run", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT,],);
    const out = proc.stdout.toString();
    // `dry-run: false` here would mean --apply was somehow set without being
    // passed, and the ticket .md files would already have been rewritten.
    expect(out,).toContain("dry-run: true",);
    expect(out,).toContain("owners: ",);
    expect(out,).toContain("remainder (untouched, needs a human):",);
    expect(proc.exitCode,).toBe(0,);
  });

  test("an unknown option is rejected with exit 1", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--no-such-flag",],);
    expect(proc.exitCode,).toBe(1,);
  });
});
