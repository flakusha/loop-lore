/**
 * Tests for chat section dividers — story-spanning navigation.
 */

import { beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { chatSections, } from "./chat-sections";
import { chatSectionsNav, } from "./chat-sections-nav";
import { computeGroupedMessages, } from "./chat-utils/grouped";
import { formatDisplayDate, } from "./chat-utils/time";

// ── Mock apiFetch (bulk-assign + narrative calls) ──────────────────────
const fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: (url: string, opts?: RequestInit,) => Promise<Response> = async () =>
  new Response("{}", { status: 200, },);

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      return fetchHandler(url, opts,);
    },
  }),);
}

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

describeOrSkip("chatSections.sectionDividerFor", () => {
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
},);

describeOrSkip("computeGroupedMessages section breaks", () => {
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
},);

describeOrSkip("chatSectionsNav.sectionMessageCounts", () => {
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
},);

describeOrSkip("chatSectionsNav.sectionActors", () => {
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
},);

describeOrSkip("chatSectionsNav.partySplit", () => {
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
},);

describeOrSkip("chatSectionsNav.currentSectionName", () => {
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
},);

describeOrSkip("chatSectionsNav.transferToSection", () => {
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
},);

describeOrSkip("chatSectionsNav.trackCurrentSection", () => {
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
},);

describeOrSkip("chatSections.sectionDividerMeta", () => {
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
},);

describeOrSkip("chatSectionsNav.bulkAssignToSection", () => {
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
    expect(fetchCalls.at(-1,)?.url,).toBe("/api/v1/chats/chat-1/sections/s1/assign-all",);
    expect(loaded,).toBe(2,);
  });

  test("no-op without active chat", async () => {
    const calls = fetchCalls.length;
    const ctx = Object.create(chatSectionsNav,);
    await (chatSectionsNav as any).bulkAssignToSection.call(ctx, "s1",);
    expect(fetchCalls.length,).toBe(calls,);
  });
},);

describeOrSkip("chatSectionsNav.insertNarrative", () => {
  test("posts narrative and reloads stream", async () => {
    let loaded = 0;
    const ctx = Object.assign(Object.create(chatSectionsNav,), {
      activeChat: "chat-1",
      loadMessages: async () => {
        loaded += 1;
      },
    },);

    await (chatSectionsNav as any).insertNarrative.call(ctx, "s1", "The party rides north.",);
    expect(fetchCalls.at(-1,)?.url,).toBe("/api/v1/chats/chat-1/sections/s1/narrative",);
    expect(loaded,).toBe(1,);
  });

  test("no-op on empty text", async () => {
    const calls = fetchCalls.length;
    const ctx = Object.assign(Object.create(chatSectionsNav,), { activeChat: "chat-1", },);
    await (chatSectionsNav as any).insertNarrative.call(ctx, "s1", emptyNarrative,);
    expect(fetchCalls.length,).toBe(calls,);
  });
},);

describeOrSkip("chatSectionsNav.transition + narrative transfer", () => {
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
},);

// ── chatSections.ts: panel + CRUD + assign (uncovered lines) ──────────

describeOrSkip("chatSections panel + CRUD", () => {
  const rows = [section("s1", "Forest",), section("s2", "Cave",), section("s3", "Town",),];

  const makeCtx = (overrides: Record<string, unknown> = {},) =>
    Object.assign(Object.create(chatSections,), {
      activeChat: "chat-1",
      _sections: rows.map((s,) => ({ ...s, })),
      _sectionsLoading: false,
      _sectionsOpen: false,
      _activeSectionId: null as string | null,
      _newSectionLabel: "",
      _newSectionDesc: "",
      groupedMessages: [] as unknown[],
      $el: undefined,
      ...overrides,
    },);

  beforeEach(() => {
    fetchCalls.length = 0;
    fetchHandler = async () => new Response("{}", { status: 200, },);
  },);

  describeOrSkip("toggleSectionsPanel", () => {
    test("opens the panel and loads sections when a chat is active", () => {
      const ctx = makeCtx();
      chatSections.toggleSectionsPanel!.call(ctx,);
      expect(ctx._sectionsOpen,).toBe(true,);
      expect(fetchCalls.length,).toBe(1,);
    });

    test("closes the panel without loading when no chat is active", () => {
      const ctx = makeCtx({ activeChat: null, _sectionsOpen: true, },);
      chatSections.toggleSectionsPanel!.call(ctx,);
      expect(ctx._sectionsOpen,).toBe(false,);
      expect(fetchCalls.length,).toBe(0,);
    });
  },);

  describeOrSkip("loadSections", () => {
    test("does nothing without an active chat", async () => {
      const ctx = makeCtx({ activeChat: null, },);
      await chatSections.loadSections!.call(ctx,);
      expect(fetchCalls.length,).toBe(0,);
      expect(ctx._sectionsLoading,).toBe(false,);
    });

    test("loads sections and activates the first", async () => {
      fetchHandler = async () => new Response(JSON.stringify({ data: rows, },), { status: 200, },);
      const ctx = makeCtx();
      await chatSections.loadSections!.call(ctx,);
      expect(ctx._sections.map((s: { id: string },) => s.id),).toEqual(["s1", "s2", "s3",],);
      expect(ctx._activeSectionId,).toBe("s1",);
      expect(ctx._sectionsLoading,).toBe(false,);
    });

    test("keeps a still-valid active section id", async () => {
      fetchHandler = async () => new Response(JSON.stringify({ data: rows, },), { status: 200, },);
      const ctx = makeCtx({ _activeSectionId: "s2", },);
      await chatSections.loadSections!.call(ctx,);
      expect(ctx._activeSectionId,).toBe("s2",);
    });

    test("resets a stale active section id to the first row", async () => {
      fetchHandler = async () => new Response(JSON.stringify({ data: rows, },), { status: 200, },);
      const ctx = makeCtx({ _activeSectionId: "gone", },);
      await chatSections.loadSections!.call(ctx,);
      expect(ctx._activeSectionId,).toBe("s1",);
    });

    test("falls back to null when the list is empty", async () => {
      fetchHandler = async () => new Response(JSON.stringify({ data: [], },), { status: 200, },);
      const ctx = makeCtx({ _activeSectionId: "s1", },);
      await chatSections.loadSections!.call(ctx,);
      expect(ctx._activeSectionId,).toBe(null,);
    });

    test("tolerates a missing data field", async () => {
      const ctx = makeCtx();
      await chatSections.loadSections!.call(ctx,);
      expect(ctx._sections,).toEqual([],);
      expect(ctx._activeSectionId,).toBe(null,);
    });

    test("clears the loading flag on non-ok response", async () => {
      fetchHandler = async () => new Response("nope", { status: 500, },);
      const ctx = makeCtx();
      await chatSections.loadSections!.call(ctx,);
      expect(ctx._sectionsLoading,).toBe(false,);
    });

    test("clears the loading flag when fetch throws", async () => {
      fetchHandler = () => Promise.reject(new Error("boom",),);
      const ctx = makeCtx();
      await chatSections.loadSections!.call(ctx,);
      expect(ctx._sectionsLoading,).toBe(false,);
    });
  },);

  describeOrSkip("createSection", () => {
    test("does nothing without an active chat", async () => {
      const ctx = makeCtx({ activeChat: null, _newSectionLabel: "New", },);
      await chatSections.createSection!.call(ctx,);
      expect(fetchCalls.length,).toBe(0,);
    });

    test("ignores a blank label", async () => {
      const ctx = makeCtx({ _newSectionLabel: "   ", },);
      await chatSections.createSection!.call(ctx,);
      expect(fetchCalls.length,).toBe(0,);
    });

    test("posts the trimmed label and clears the fields on ok", async () => {
      const ctx = makeCtx({ _newSectionLabel: "  New  ", _newSectionDesc: "d", },);
      await chatSections.createSection!.call(ctx,);
      expect(fetchCalls.length,).toBe(2,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/sections",);
      expect(fetchCalls[0]?.opts.method,).toBe("POST",);
      expect(JSON.parse(String(fetchCalls[0]?.opts.body,),),).toEqual({ label: "New", description: "d", },);
      expect(ctx._newSectionLabel,).toBe("",);
      expect(ctx._newSectionDesc,).toBe("",);
    });

    test("sends a null description when none is given", async () => {
      const ctx = makeCtx({ _newSectionLabel: "New", },);
      await chatSections.createSection!.call(ctx,);
      expect(JSON.parse(String(fetchCalls[0]?.opts.body,),),).toEqual({ label: "New", description: null, },);
    });

    test("keeps the fields on !ok", async () => {
      fetchHandler = async () => new Response("nope", { status: 400, },);
      const ctx = makeCtx({ _newSectionLabel: "New", },);
      await chatSections.createSection!.call(ctx,);
      expect(ctx._newSectionLabel,).toBe("New",);
      expect(fetchCalls.length,).toBe(1,);
    });
  },);

  describeOrSkip("deleteSection", () => {
    test("does nothing without an active chat", async () => {
      const ctx = makeCtx({ activeChat: null, },);
      await chatSections.deleteSection!.call(ctx, "s1",);
      expect(fetchCalls.length,).toBe(0,);
    });

    test("deletes, clears the active id, and reloads on ok", async () => {
      const ctx = makeCtx({ _activeSectionId: "s2", },);
      await chatSections.deleteSection!.call(ctx, "s2",);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/sections/s2",);
      expect(fetchCalls[0]?.opts.method,).toBe("DELETE",);
      expect(ctx._activeSectionId,).toBe(null,);
      expect(fetchCalls.length,).toBe(2,);
    });

    test("keeps the active id when deleting another section", async () => {
      // The post-delete reload must still see s1 as valid, or it would reset.
      fetchHandler = async () => new Response(JSON.stringify({ data: rows, },), { status: 200, },);
      const ctx = makeCtx({ _activeSectionId: "s1", },);
      await chatSections.deleteSection!.call(ctx, "s3",);
      expect(ctx._activeSectionId,).toBe("s1",);
    });
  },);

  describeOrSkip("moveSection", () => {
    test("does nothing without an active chat", async () => {
      const ctx = makeCtx({ activeChat: null, },);
      await chatSections.moveSection!.call(ctx, "s1", 1,);
      expect(fetchCalls.length,).toBe(0,);
    });

    test("ignores an unknown section id", async () => {
      const ctx = makeCtx();
      await chatSections.moveSection!.call(ctx, "nope", 1,);
      expect(fetchCalls.length,).toBe(0,);
    });

    test("ignores moves that would leave the bounds", async () => {
      const ctx = makeCtx();
      await chatSections.moveSection!.call(ctx, "s1", -1,);
      await chatSections.moveSection!.call(ctx, "s3", 1,);
      expect(fetchCalls.length,).toBe(0,);
    });

    test("posts the reordered id list and reloads on ok", async () => {
      const ctx = makeCtx();
      await chatSections.moveSection!.call(ctx, "s2", -1,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/sections/reorder",);
      expect(JSON.parse(String(fetchCalls[0]?.opts.body,),),).toEqual({ sectionIds: ["s2", "s1", "s3",], },);
      expect(fetchCalls.length,).toBe(2,);
    });

    test("does not reload on !ok", async () => {
      fetchHandler = async () => new Response("nope", { status: 500, },);
      const ctx = makeCtx();
      await chatSections.moveSection!.call(ctx, "s2", 1,);
      expect(fetchCalls.length,).toBe(1,);
    });
  },);

  describeOrSkip("sectionLabel", () => {
    test("returns Unassigned for null", () => {
      const ctx = makeCtx();
      expect(chatSections.sectionLabel!.call(ctx, null,),).toBe("Unassigned",);
    });

    test("returns Unknown for a missing section", () => {
      const ctx = makeCtx();
      expect(chatSections.sectionLabel!.call(ctx, "nope",),).toBe("Unknown",);
    });

    test("returns the label for a known section", () => {
      const ctx = makeCtx();
      expect(chatSections.sectionLabel!.call(ctx, "s2",),).toBe("Cave",);
    });
  },);

  describeOrSkip("jumpToSection", () => {
    test("does nothing when no message is in the section", () => {
      const ctx = makeCtx({ groupedMessages: [msg("m1", "s1",),], },);
      chatSections.jumpToSection!.call(ctx, "s2",);
    });

    test("scrolls to the first message of the section", () => {
      let scrolled = false;
      let selector = "";
      const el = {
        scrollIntoView: () => {
          scrolled = true;
        },
      };

      const ctx = makeCtx({
        groupedMessages: [msg("m1", "s1",), msg("m2", "s2",),],
        $el: {
          querySelector: (sel: string,) => {
            selector = sel;
            return el;
          },
        },
      },);

      // bun has no CSS global — stub the escape used for the selector.
      const realCSS = (globalThis as Record<string, unknown>).CSS;
      (globalThis as Record<string, unknown>).CSS = { escape: (s: string,) => s, };
      try {
        chatSections.jumpToSection!.call(ctx, "s2",);
      } finally {
        (globalThis as Record<string, unknown>).CSS = realCSS;
      }

      expect(selector,).toBe('[data-message-id="m2"]',);
      expect(scrolled,).toBe(true,);
    });
  },);

  describeOrSkip("formatSectionTime", () => {
    test("returns an empty string for null", () => {
      const ctx = makeCtx();
      expect(chatSections.formatSectionTime!.call(ctx, null,),).toBe("",);
    });

    test("formats an ISO timestamp as a time", () => {
      const ctx = makeCtx();
      expect(
        chatSections.formatSectionTime!.call(ctx, "2024-03-05T14:30:00Z",),
      ).toBe(formatDisplayDate("2024-03-05T14:30:00Z", "time",),);
    });
  },);

  describeOrSkip("assignMessageToSection", () => {
    test("does nothing without an active chat", async () => {
      const ctx = makeCtx({ activeChat: null, },);
      await chatSections.assignMessageToSection!.call(ctx, "m1", "s1",);
      expect(fetchCalls.length,).toBe(0,);
    });

    test("posts the section id", async () => {
      const ctx = makeCtx();
      await chatSections.assignMessageToSection!.call(ctx, "m1", "s2",);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/messages/m1/section",);
      expect(fetchCalls[0]?.opts.method,).toBe("POST",);
      expect(JSON.parse(String(fetchCalls[0]?.opts.body,),),).toEqual({ sectionId: "s2", },);
    });

    test("posts a null section id to unassign", async () => {
      const ctx = makeCtx();
      await chatSections.assignMessageToSection!.call(ctx, "m1", null,);
      expect(JSON.parse(String(fetchCalls[0]?.opts.body,),),).toEqual({ sectionId: null, },);
    });

    test("swallows fetch errors", async () => {
      fetchHandler = () => Promise.reject(new Error("boom",),);
      const ctx = makeCtx();
      await chatSections.assignMessageToSection!.call(ctx, "m1", "s1",);
    });
  },);
},);
