/**
 * Tests for chat section dividers — story-spanning navigation.
 */

import { describe, expect, test, } from "bun:test";
import { chatSections, } from "./chat-sections";
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
  const ctx = {
    ...chatSections,
    _sections: [
      section("s1", "The Dark Forest",),
      section("s2", "Castle Gates",),
    ],
    groupedMessages: [] as ReturnType<typeof msg>[],
  };

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
