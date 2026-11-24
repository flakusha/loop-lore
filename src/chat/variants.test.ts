// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat variant taxonomy tests.
 *
 * Verifies the 12-variant canonical taxonomy table:
 *   - every variant resolves to defaults (no holes in VARIANT_DEFAULTS)
 *   - the (chat_type, chat_mode, chat_purpose) triple is unique per variant
 *   - mismatched triples are rejected by validateVariantTriple
 *   - the extended ChatPurpose enum contains all old + new strings
 *
 * The type contract is the point here, so shape claims are pinned at compile
 * time with `expectTypeOf` (same convention as
 * src/frontend/alpine/world-types.test.ts): a widened field type, a widened
 * enum union, or a missing/extra variant key fails
 * `tsgo --noEmit --project tsconfig.backend.json` instead of slipping past a
 * runtime-only check.
 */

import { describe, expect, expectTypeOf, it, } from "bun:test";
import { ChatMode, ChatPurpose, ChatType, } from "../db/enums-core/users";
import {
  CHAT_VARIANTS,
  type ChatVariant,
  getVariantDefaults,
  type GmConfig,
  validateVariantTriple,
  VARIANT_DEFAULTS,
  type VariantDefaults,
} from "./types/variants";

describe("VARIANT_DEFAULTS — 12-variant canonical taxonomy", () => {
  it("pins the 12-member ChatVariant union and the tables that cover it", () => {
    expectTypeOf<ChatVariant>().toEqualTypeOf<
      | "assistant"
      | "assistant_group"
      | "user_1x1"
      | "user_group"
      | "user_group_admin"
      | "llm_only"
      | "llm_only_group"
      | "llm_only_group_gm"
      | "character"
      | "character_group"
      | "rpg"
      | "rpg_group"
    >();

    expectTypeOf<(typeof CHAT_VARIANTS)[number]>().toEqualTypeOf<ChatVariant>();
    expectTypeOf<keyof typeof VARIANT_DEFAULTS>().toEqualTypeOf<ChatVariant>();
  });

  it("every variant resolves to valid ChatType / ChatMode / ChatPurpose", () => {
    expectTypeOf<ChatType>().toEqualTypeOf<"direct" | "group">();
    expectTypeOf<VariantDefaults["chat_type"]>().toEqualTypeOf<ChatType>();
    expectTypeOf<VariantDefaults["chat_mode"]>().toEqualTypeOf<ChatMode>();
    expectTypeOf<VariantDefaults["chat_purpose"]>().toEqualTypeOf<ChatPurpose>();
  });

  it("every variant has max_turns (number|null) and auto_advance ∈ {0,1}", () => {
    expectTypeOf<VariantDefaults["max_turns"]>().toEqualTypeOf<number | null>();
    expectTypeOf<VariantDefaults["auto_advance"]>().toEqualTypeOf<0 | 1>();

    for (const v of CHAT_VARIANTS) {
      const d = VARIANT_DEFAULTS[v];
      const validMt = d.max_turns === null || Number.isFinite(d.max_turns,);
      expect(validMt,).toBe(true,);
    }
  });

  it("talkativity is a number in [1,10]", () => {
    expectTypeOf<VariantDefaults["talkativity"]>().toEqualTypeOf<number>();

    for (const v of CHAT_VARIANTS) {
      const t = VARIANT_DEFAULTS[v].talkativity;
      expect(t,).toBeGreaterThanOrEqual(1,);
      expect(t,).toBeLessThanOrEqual(10,);
    }
  });

  it("(chat_type, chat_mode, chat_purpose) triple is unique per variant except variants 4+5 (share group/story/social)", () => {
    const seen = new Map<string, ChatVariant>();
    for (const v of CHAT_VARIANTS) {
      const d = VARIANT_DEFAULTS[v];
      const key = `${d.chat_type}|${d.chat_mode}|${d.chat_purpose}`;
      const prev = seen.get(key,);
      if (prev !== undefined) {
        // Variant 4 (user_group) and variant 5 (user_group_admin) share
        // (group, story, social) by design — they differ on auxiliary
        // gm_config (moderation block). Allow that specific collision.
        const allowedPairs: Array<[ChatVariant, ChatVariant,]> = [
          ["user_group", "user_group_admin",],
        ];

        const ok = allowedPairs.some((pair,) =>
          (pair[0] === prev && pair[1] === v) || (pair[1] === prev && pair[0] === v)
        );

        expect(ok,).toBe(true,);
      }

      seen.set(key, v,);
    }
  });

  it("LLM-validation variants (6, 7) auto_advance=1 and have prompt_override_default", () => {
    for (const v of ["llm_only", "llm_only_group",] as const) {
      const d = VARIANT_DEFAULTS[v];
      expect(d.auto_advance,).toBe(1,);
      expect(d.prompt_override_default,).not.toBeNull();
    }
  });

  it("RPG group (12) uses chat_mode=battle per epic taxonomy rationale", () => {
    const d = VARIANT_DEFAULTS.rpg_group;
    expect(d.chat_mode,).toBe(ChatMode.Battle,);
    expect(d.chat_purpose,).toBe(ChatPurpose.Rpg,);
    expect(d.chat_type,).toBe(ChatType.Group,);
  });

  it("LLM-only variants (6, 7) use chat_mode=battle", () => {
    for (const v of ["llm_only", "llm_only_group",] as const) {
      expect(VARIANT_DEFAULTS[v].chat_mode,).toBe(ChatMode.Battle,);
    }
  });

  it("pins the GmConfig union shape", () => {
    expectTypeOf<Extract<GmConfig, { moderation: unknown }>["moderation"]>().toEqualTypeOf<{
      slow_mode_ms?: number;
      pinned?: string[];
      lock?: boolean;
    }>();

    expectTypeOf<Extract<GmConfig, { validation: unknown }>["validation"]>().toEqualTypeOf<{
      harness: string;
    }>();

    expectTypeOf<Extract<GmConfig, { cast: unknown }>["cast"]>().toEqualTypeOf<string[]>();
    expectTypeOf<Extract<GmConfig, { cast: unknown }>["director"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Extract<GmConfig, { rpg_party: unknown }>["party_size"]>().toEqualTypeOf<number>();
  });

  it("user group admin (5) carries a moderation gm_config block", () => {
    const d = VARIANT_DEFAULTS.user_group_admin;
    expect(d.gm_config,).not.toBeNull();
    expect(d.gm_config !== null && "moderation" in d.gm_config,).toBe(true,);
  });

  it("character group (10) carries a cast gm_config block", () => {
    const d = VARIANT_DEFAULTS.character_group;
    expect(d.gm_config,).not.toBeNull();
    expect(d.gm_config !== null && "cast" in d.gm_config,).toBe(true,);
  });
});

describe("getVariantDefaults", () => {
  it("returns VariantDefaults | undefined for a string key", () => {
    expectTypeOf<ReturnType<typeof getVariantDefaults>>().toEqualTypeOf<VariantDefaults | undefined>();
    expect(getVariantDefaults("assistant",),).toBe(VARIANT_DEFAULTS.assistant,);
  });

  it("returns undefined for an unknown variant", () => {
    expect(getVariantDefaults("nonexistent",),).toBeUndefined();
  });
});

describe("validateVariantTriple", () => {
  it("takes a ChatVariant plus three strings and returns string | null", () => {
    expectTypeOf<Parameters<typeof validateVariantTriple>>().toEqualTypeOf<
      [ChatVariant, string, string, string,]
    >();

    expectTypeOf<ReturnType<typeof validateVariantTriple>>().toEqualTypeOf<string | null>();
  });

  it("returns null when the supplied triple matches the variant", () => {
    for (const v of CHAT_VARIANTS) {
      const d = VARIANT_DEFAULTS[v];
      expect(validateVariantTriple(v, d.chat_type, d.chat_mode, d.chat_purpose,),).toBeNull();
    }
  });

  it("rejects mismatched chat_type", () => {
    const err = validateVariantTriple("assistant", "group", "story", "assistant",);
    expect(err,).toContain("chat_type",);
    expect(err,).toContain("assistant",);
  });

  it("rejects mismatched chat_mode", () => {
    const err = validateVariantTriple("user_1x1", "direct", "group", "social",);
    expect(err,).toContain("chat_mode",);
  });

  it("rejects mismatched chat_purpose", () => {
    const err = validateVariantTriple("character", "direct", "story", "social",);
    expect(err,).toContain("chat_purpose",);
  });

  it("rejects an unknown variant name", () => {
    expect(validateVariantTriple("bogus" as ChatVariant, "direct", "story", "assistant",),).toContain(
      "Unknown variant",
    );
  });
});

describe("ChatPurpose enum — back-compat + 6 new values", () => {
  it("retains the original three values for back-compat", () => {
    expect(ChatPurpose.Main,).toBe("main",);
    expect(ChatPurpose.Side,).toBe("side",);
    expect(ChatPurpose.Notes,).toBe("notes",);
  });

  it("includes the six taxonomy purposes", () => {
    expect(ChatPurpose.Assistant,).toBe("assistant",);
    expect(ChatPurpose.Roleplay,).toBe("roleplay",);
    expect(ChatPurpose.Rpg,).toBe("rpg",);
    expect(ChatPurpose.Social,).toBe("social",);
    expect(ChatPurpose.Guided,).toBe("guided",);
    expect(ChatPurpose.Validation,).toBe("validation",);
  });

  it("exposes exactly nine values", () => {
    expectTypeOf<ChatPurpose>().toEqualTypeOf<
      | "main"
      | "side"
      | "notes"
      | "assistant"
      | "roleplay"
      | "rpg"
      | "social"
      | "guided"
      | "validation"
    >();

    expect(Object.keys(ChatPurpose,).length,).toBe(9,);
  });
});

describe("ChatMode enum — adds battle for variants 6/7/12", () => {
  it("retains original three values", () => {
    expect(ChatMode.Direct,).toBe("direct",);
    expect(ChatMode.Group,).toBe("group",);
    expect(ChatMode.Story,).toBe("story",);
  });

  it("adds battle", () => {
    expectTypeOf<ChatMode>().toEqualTypeOf<"direct" | "group" | "story" | "battle">();
    expect(ChatMode.Battle,).toBe("battle",);
  });
});
