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
 */

import { describe, expect, it, } from "bun:test";
import { ChatMode, ChatPurpose, ChatType, } from "../db/enums-core/users";
import {
  CHAT_VARIANTS,
  type ChatVariant,
  getVariantDefaults,
  validateVariantTriple,
  VARIANT_DEFAULTS,
} from "./types/variants";

describe("VARIANT_DEFAULTS — 12-variant canonical taxonomy", () => {
  it("covers all 12 variants", () => {
    expect(Object.keys(VARIANT_DEFAULTS,).length,).toBe(12,);
    for (const v of CHAT_VARIANTS) {
      expect(VARIANT_DEFAULTS[v],).toBeDefined();
    }
  });

  it("each variant resolves to valid ChatType / ChatMode / ChatPurpose", () => {
    const validTypes = Object.fromEntries(Object.values(ChatType,).map((s,) => [s, true,]),) as Record<string, true>;
    const validModes = Object.fromEntries(Object.values(ChatMode,).map((s,) => [s, true,]),) as Record<string, true>;
    const validPurposes = Object.fromEntries(Object.values(ChatPurpose,).map((s,) => [s, true,]),) as Record<
      string,
      true
    >;
    for (const v of CHAT_VARIANTS) {
      const d = VARIANT_DEFAULTS[v];
      expect(validTypes[d.chat_type],).toBe(true,);
      expect(validModes[d.chat_mode],).toBe(true,);
      expect(validPurposes[d.chat_purpose],).toBe(true,);
    }
  });

  it("every variant has max_turns (number|null) and auto_advance ∈ {0,1}", () => {
    for (const v of CHAT_VARIANTS) {
      const d = VARIANT_DEFAULTS[v];
      const validMt = d.max_turns === null || Number.isFinite(d.max_turns,);
      expect(validMt,).toBe(true,);
      expect([0, 1,],).toContain(d.auto_advance,);
    }
  });

  it("talkativity is null or a number in [1,10]", () => {
    for (const v of CHAT_VARIANTS) {
      const t = VARIANT_DEFAULTS[v].talkativity;
      if (t !== null) {
        expect(t,).toBeGreaterThanOrEqual(1,);
        expect(t,).toBeLessThanOrEqual(10,);
      }
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

  it("user group admin (5) carries a moderation gm_config block", () => {
    const d = VARIANT_DEFAULTS.user_group_admin;
    expect(d.gm_config,).not.toBeNull();
    expect((d.gm_config as Record<string, unknown>).moderation,).toBeDefined();
  });

  it("character group (10) carries a cast gm_config block", () => {
    const d = VARIANT_DEFAULTS.character_group;
    expect(d.gm_config,).not.toBeNull();
    expect((d.gm_config as Record<string, unknown>).cast,).toBeDefined();
  });
});

describe("getVariantDefaults", () => {
  it("returns the entry for a known variant", () => {
    expect(getVariantDefaults("assistant",),).toBe(VARIANT_DEFAULTS.assistant,);
  });
  it("returns undefined for an unknown variant", () => {
    expect(getVariantDefaults("nonexistent",),).toBeUndefined();
  });
});

describe("validateVariantTriple", () => {
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
    expect(ChatMode.Battle,).toBe("battle",);
  });
});
