/**
 * Tests for chat section dividers — story-spanning navigation.
 */

import { describe, expect, mock, test, } from "bun:test";
import { chatSections, } from "./chat-sections";
import { chatSectionsNav, } from "./chat-sections-nav";
import { computeGroupedMessages, } from "./chat-utils/grouped";

// ── Mock apiFetch (bulk-assign + narrative calls) ──────────────────────
const fetchCalls: { url: string; opts: RequestInit }[] = [];
mock.module("./htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    return new Response("{}", { status: 200, },);
  },
}),);
const emptyNarrative = " ".repeat(3,);

const section = (id: string, label: string,) => ({
  id,
  label,
  description: null,
  location_id: null,
  sort_index: 0,
});

/**
 * @param id
 * @param sectionId
 */
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
  // tests/setup-globals.ts installs a shared globalThis.document for all
  // frontend tests: save/restore it instead of deleting, so later files
  // (e.g. chat-seen.test.ts) keep their DOM shim.
  const originalDocument = (globalThis as any).document;
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
    (globalThis as any).document = originalDocument;
  });

  test("null when no dividers mounted", () => {
    (globalThis as any).document = {
      querySelector: () => ({ scrollTop: 50, querySelectorAll: () => [], }),
    };
    const ctx = Object.assign(Object.create(chatSectionsNav,), { _currentSectionId: "s1", },);
    (chatSectionsNav as any).trackCurrentSection.call(ctx,);
    expect(ctx._currentSectionId,).toBeNull();
    (globalThis as any).document = originalDocument;
  });

  test("null when message list not mounted", () => {
    (globalThis as any).document = { querySelector: () => null, };
    const ctx = Object.assign(Object.create(chatSectionsNav,), { _currentSectionId: "s1", },);
    (chatSectionsNav as any).trackCurrentSection.call(ctx,);
    expect(ctx._currentSectionId,).toBe("s1",);
    (globalThis as any).document = originalDocument;
  });
});

describe("chatSections.sectionDividerMeta", () => {
  test("counts messages and reports first message time", () => {
    const ctx = Object.assign(Object.create(chatSections,), {
      groupedMessages: [
        msg("m1", "s1",),
        { ...msg("m2", "s1",), created_at: "2024-01-01T12:30:00Z", },
        msg("m3", "s2",),
      ],
    },);
    const meta = (chatSections as any).sectionDividerMeta.call(ctx, "s1",);
    expect(meta.count,).toBe(2,);
    expect(meta.startTime,).toBe("2024-01-01T00:00:00Z",);
  });

  test("empty section has zero count and null start", () => {
    const ctx = Object.assign(Object.create(chatSections,), { groupedMessages: [], },);
    const meta = (chatSections as any).sectionDividerMeta.call(ctx, "s1",);
    expect(meta,).toEqual({ count: 0, startTime: null, },);
  });

  test("formatSectionTime renders HH:MM", () => {
    const ctx = Object.create(chatSections,);
    expect((chatSections as any).formatSectionTime.call(ctx, "2024-01-01T14:32:00Z",),).toMatch(/\d{2}:\d{2}/,);
    expect((chatSections as any).formatSectionTime.call(ctx, null,),).toBe("",);
    expect((chatSections as any).formatSectionTime.call(ctx, "not-a-date",),).toBe("",);
  });
});

describe("chatSectionsNav.bulkAssignToSection", () => {
  test("posts assign-all and reloads stream + sections", async () => {
    let loaded = 0;
    const ctx = Object.assign(Object.create(chatSectionsNav,), {
      activeChat: "chat-1",
      loadMessages: async () => {
        loaded += 1;
      },
      loadSections: async () => {
        loaded += 1;
      },
    },);
    await (chatSectionsNav as any).bulkAssignToSection.call(ctx, "s1",);
    expect(fetchCalls.at(-1,)?.url,).toBe("/api/chats/chat-1/sections/s1/assign-all",);
    expect(loaded,).toBe(2,);
  });

  test("no-op without active chat", async () => {
    const calls = fetchCalls.length;
    const ctx = Object.create(chatSectionsNav,);
    await (chatSectionsNav as any).bulkAssignToSection.call(ctx, "s1",);
    expect(fetchCalls.length,).toBe(calls,);
  });
});

describe("chatSectionsNav.insertNarrative", () => {
  test("posts narrative and reloads stream", async () => {
    let loaded = 0;
    const ctx = Object.assign(Object.create(chatSectionsNav,), {
      activeChat: "chat-1",
      loadMessages: async () => {
        loaded += 1;
      },
    },);
    await (chatSectionsNav as any).insertNarrative.call(ctx, "s1", "The party rides north.",);
    expect(fetchCalls.at(-1,)?.url,).toBe("/api/chats/chat-1/sections/s1/narrative",);
    expect(loaded,).toBe(1,);
  });

  test("no-op on empty text", async () => {
    const calls = fetchCalls.length;
    const ctx = Object.assign(Object.create(chatSectionsNav,), { activeChat: "chat-1", },);
    await (chatSectionsNav as any).insertNarrative.call(ctx, "s1", emptyNarrative,);
    expect(fetchCalls.length,).toBe(calls,);
  });
});

describe("chatSectionsNav.transition + narrative transfer", () => {
  test("setTransitionType stores the pick", () => {
    const ctx = Object.create(chatSectionsNav,);
    (chatSectionsNav as any).setTransitionType.call(ctx, "teleport",);
    expect(ctx._transitionType,).toBe("teleport",);
  });

  test("transfer with narrative type inserts narrative and clears text", async () => {
    const narratives: string[] = [];
    const ctx = Object.assign(Object.create(chatSectionsNav,), {
      activeChat: "chat-1",
      _sections: [section("s1", "Forest",),],
      _activeSectionId: null,
      _transitionType: "narrative",
      _narrativeText: "  Riders cross the bridge.  ",
      _transferFx: false,
      jumpToSection: () => {},
      insertNarrative: async (sectionId: string, text: string,) => {
        narratives.push(`${sectionId}:${text}`,);
      },
    },);
    await (chatSectionsNav as any).transferToSection.call(ctx, "s1",);
    expect(narratives,).toEqual(["s1:Riders cross the bridge.",],);
    expect(ctx._narrativeText,).toBe("",);
    expect(ctx._transferFx,).toBe(true,);
    expect(ctx._activeSectionId,).toBe("s1",);
  });

  test("transfer without narrative text skips insertion", async () => {
    let inserted = false;
    const ctx = Object.assign(Object.create(chatSectionsNav,), {
      activeChat: "chat-1",
      _sections: [section("s1", "Forest",),],
      _activeSectionId: null,
      _transitionType: "narrative",
      _narrativeText: "",
      _transferFx: false,
      jumpToSection: () => {},
      insertNarrative: async () => {
        inserted = true;
      },
    },);
    await (chatSectionsNav as any).transferToSection.call(ctx, "s1",);
    expect(inserted,).toBe(false,);
  });
});
