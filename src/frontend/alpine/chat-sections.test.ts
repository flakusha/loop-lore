/**
 * Tests for chat section dividers — story-spanning navigation.
 */

import { describe, expect, test, } from "bun:test";
import { chatSections, } from "./chat-sections";
import { chatSectionsNav, } from "./chat-sections-nav";
import { computeGroupedMessages, } from "./chat-utils/grouped";

const section = (id: string, label: string,) => ({
  id,
  label,
  description: null,
  location_id: null,
  sort_index: 0,
});

function msg(id: string, sectionId: string | null,) {
  return {
    id,
    role: "assistant",
    content: `msg ${id}`,
    created_at: "2024-01-01T00:00:00Z",
    section_id: sectionId,
  };
}

describe("chatSections.sectionDividerFor", () => {
  const ctx = Object.assign(Object.create(chatSections,), {
    _sections: [
      section("s1", "The Dark Forest",),
      section("s2", "Castle Gates",),
    ],
    groupedMessages: [] as ReturnType<typeof msg>[],
  },);

  test("returns section for first message with a section", () => {
    ctx.groupedMessages = [msg("m1", "s1",),];
    const div = (chatSections as any).sectionDividerFor.call(ctx, 0, "s1",);
    expect(div?.label,).toBe("The Dark Forest",);
  });

  test("returns null when previous message has same section", () => {
    ctx.groupedMessages = [msg("m1", "s1",), msg("m2", "s1",),];
    const div = (chatSections as any).sectionDividerFor.call(ctx, 1, "s1",);
    expect(div,).toBeNull();
  });

  test("returns section when section changes between messages", () => {
    ctx.groupedMessages = [msg("m1", "s1",), msg("m2", "s2",),];
    const div = (chatSections as any).sectionDividerFor.call(ctx, 1, "s2",);
    expect(div?.label,).toBe("Castle Gates",);
  });

  test("returns null for unassigned messages", () => {
    ctx.groupedMessages = [msg("m1", null,), msg("m2", "s1",),];
    expect((chatSections as any).sectionDividerFor.call(ctx, 0, null,),).toBeNull();
  });

  test("returns null for unknown section id", () => {
    ctx.groupedMessages = [msg("m1", "nope",),];
    expect((chatSections as any).sectionDividerFor.call(ctx, 0, "nope",),).toBeNull();
  });
});

describe("computeGroupedMessages section breaks", () => {
  const base = {
    role: "assistant",
    content: "x",
    created_at: "2024-01-01T00:00:00Z",
  };

  test("breaks group when section changes mid-run", () => {
    const msgs = [
      { ...msg("m1", "s1",), role: "assistant", },
      { ...msg("m2", "s2",), role: "assistant", },
      { ...msg("m3", "s2",), role: "assistant", },
    ];
    const groups = computeGroupedMessages.call({ ...base, messages: msgs, } as any,);
    expect(groups.map((g,) => g.section_id),).toEqual(["s1", "s2", "s2",],);
    // m2 starts a new section → no group; m3 same section → grouped with m2.
    expect(groups[1]?.group,).toBeUndefined();
    expect(groups[2]?.group,).toBe(true,);
  });

  test("keeps group when section unchanged", () => {
    const msgs = [
      { ...msg("m1", "s1",), role: "assistant", },
      { ...msg("m2", "s1",), role: "assistant", },
    ];
    const groups = computeGroupedMessages.call({ ...base, messages: msgs, } as any,);
    expect(groups[1]?.group,).toBe(true,);
  });

  test("empty messages returns empty", () => {
    expect(computeGroupedMessages.call({ ...base, messages: [], } as any,),).toEqual([],);
  });
});

describe("chatSectionsNav.sectionMessageCounts", () => {
  const ctx = Object.assign(Object.create(chatSectionsNav,), {
    _sections: [section("s1", "Forest",), section("s2", "Tavern",),],
    groupedMessages: [
      { ...msg("m1", "s1",), actor_name: "Aria", },
      { ...msg("m2", "s1",), actor_name: "Borin", },
      { ...msg("m3", "s2",), actor_name: "Aria", },
      { ...msg("m4", null,), },
    ],
  },);

  test("counts per section, skips unassigned", () => {
    const counts = (chatSectionsNav as any).sectionMessageCounts.call(ctx,);
    expect(counts.get("s1",),).toBe(2,);
    expect(counts.get("s2",),).toBe(1,);
    expect(counts.has("unassigned",),).toBe(false,);
  });

  test("empty stream returns empty map", () => {
    const counts = (chatSectionsNav as any).sectionMessageCounts.call({
      ...ctx,
      groupedMessages: [],
    },);
    expect(counts.size,).toBe(0,);
  });
});

describe("chatSectionsNav.sectionActors", () => {
  const ctx = Object.assign(Object.create(chatSectionsNav,), {
    groupedMessages: [
      { ...msg("m1", "s1",), actor_name: "Aria", },
      { ...msg("m2", "s1",), actor_name: "Borin", },
      { ...msg("m3", "s1",), actor_name: "Aria", },
      { ...msg("m4", "s2",), actor_name: "Aria", },
      { ...msg("m5", "s1",), }, // no actor
    ],
  },);

  test("unique actors per section", () => {
    const actors = (chatSectionsNav as any).sectionActors.call(ctx, "s1",);
    expect(actors,).toEqual(expect.arrayContaining(["Aria", "Borin",],),);
    expect(actors.length,).toBe(2,);
  });

  test("actor present in multiple sections", () => {
    expect((chatSectionsNav as any).sectionActors.call(ctx, "s2",),).toEqual(["Aria",],);
  });
});

describe("chatSectionsNav.partySplit", () => {
  // Object.create avoids evaluating getters during spread (getters read `this`).
  const getter = () => Object.getOwnPropertyDescriptor(chatSectionsNav, "partySplit",)!;
  const ctxFor = (groupedMessages: unknown[],) => Object.assign(Object.create(chatSectionsNav,), { groupedMessages, },);

  test("true when actors span sections", () => {
    const ctx = ctxFor([
      { ...msg("m1", "s1",), actor_name: "Aria", },
      { ...msg("m2", "s2",), actor_name: "Borin", },
    ],);
    expect(getter().get!.call(ctx,),).toBe(true,);
  });

  test("false when single section occupied", () => {
    const ctx = ctxFor([
      { ...msg("m1", "s1",), actor_name: "Aria", },
      { ...msg("m2", "s1",), actor_name: "Borin", },
    ],);
    expect(getter().get!.call(ctx,),).toBe(false,);
  });

  test("false when only one actor with messages", () => {
    const ctx = ctxFor([
      { ...msg("m1", "s1",), actor_name: "Aria", },
      { ...msg("m2", null,), actor_name: "Aria", },
    ],);
    expect(getter().get!.call(ctx,),).toBe(false,);
  });
});

describe("chatSectionsNav.currentSectionName", () => {
  const getter = () => Object.getOwnPropertyDescriptor(chatSectionsNav, "currentSectionName",)!;

  test("resolves label for current section", () => {
    const ctx = Object.assign(Object.create(chatSectionsNav,), {
      _sections: [section("s1", "Forest",),],
      _currentSectionId: "s1",
      sectionLabel: chatSections.sectionLabel,
    },);
    expect(getter().get!.call(ctx,),).toBe("Forest",);
  });

  test("null when no current section", () => {
    const ctx = Object.assign(Object.create(chatSectionsNav,), { _currentSectionId: null, },);
    expect(getter().get!.call(ctx,),).toBeNull();
  });
});

describe("chatSectionsNav.transferToSection", () => {
  test("sets active, jumps, and syncs location when section has one", async () => {
    const jumped: string[] = [];
    const changed: { to: string | null } = { to: null, };
    const ctx = Object.assign(Object.create(chatSectionsNav,), {
      activeChat: "chat-1",
      _sections: [section("s1", "Forest",), { ...section("s2", "Tavern",), location_id: "loc-9", },],
      _activeSectionId: null,
      _selectedLocationId: "",
      jumpToSection: (id: string,) => {
        jumped.push(id,);
      },
      changeChatLocation: async () => {
        changed.to = ctx._selectedLocationId;
      },
    },);

    await (chatSectionsNav as any).transferToSection.call(ctx, "s2",);
    expect(ctx._activeSectionId,).toBe("s2",);
    expect(jumped,).toEqual(["s2",],);
    expect(changed.to,).toBe("loc-9",);
  });

  test("no location sync when section has no location", async () => {
    let changed = false;
    const ctx = Object.assign(Object.create(chatSectionsNav,), {
      activeChat: "chat-1",
      _sections: [section("s1", "Forest",),],
      _activeSectionId: null,
      jumpToSection: () => {},
      changeChatLocation: async () => {
        changed = true;
      },
    },);

    await (chatSectionsNav as any).transferToSection.call(ctx, "s1",);
    expect(ctx._activeSectionId,).toBe("s1",);
    expect(changed,).toBe(false,);
  });

  test("no-op when no active chat", async () => {
    let jumped = false;
    const ctx = Object.assign(Object.create(chatSectionsNav,), {
      activeChat: null,
      _sections: [section("s1", "Forest",),],
      jumpToSection: () => {
        jumped = true;
      },
    },);
    await (chatSectionsNav as any).transferToSection.call(ctx, "s1",);
    expect(jumped,).toBe(false,);
  });
});

describe("chatSectionsNav.trackCurrentSection", () => {
  const divider = (sectionId: string, top: number,) => ({
    dataset: { sectionId, },
    offsetTop: top,
  });

  test("finds section at or above viewport", () => {
    const qsa = () => [divider("s1", 0,), divider("s2", 300,), divider("s3", 700,),];
    (globalThis as any).document = {
      querySelector: () => ({ scrollTop: 350, querySelectorAll: qsa, }),
    };
    const ctx = Object.create(chatSectionsNav,);
    (chatSectionsNav as any).trackCurrentSection.call(ctx,);
    expect(ctx._currentSectionId,).toBe("s2",);
    delete (globalThis as any).document;
  });

  test("null when no dividers mounted", () => {
    (globalThis as any).document = {
      querySelector: () => ({ scrollTop: 50, querySelectorAll: () => [], }),
    };
    const ctx = Object.assign(Object.create(chatSectionsNav,), { _currentSectionId: "s1", },);
    (chatSectionsNav as any).trackCurrentSection.call(ctx,);
    expect(ctx._currentSectionId,).toBeNull();
    delete (globalThis as any).document;
  });

  test("null when message list not mounted", () => {
    (globalThis as any).document = { querySelector: () => null, };
    const ctx = Object.assign(Object.create(chatSectionsNav,), { _currentSectionId: "s1", },);
    (chatSectionsNav as any).trackCurrentSection.call(ctx,);
    expect(ctx._currentSectionId,).toBe("s1",);
    delete (globalThis as any).document;
  });
});
