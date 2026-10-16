// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the pure chat-list view-model.
 *
 * Resource contract: OWNS NOTHING. No database, clock, filesystem, network, or
 * env. Pure projection over caller-supplied rows — order-independent, no
 * teardown.
 */
import { describe, expect, test, } from "bun:test";
import { buildChatListViewModel, type ChatListRow, } from "./chat-list";

/**
 * @param overrides
 */
function chat(overrides: Partial<ChatListRow> = {},): ChatListRow {
  return {
    id: "chat-1",
    name: "Tavern",
    type: "solo",
    is_pinned: "",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    encryption_level: "none",
    world_name: null,
    location_name: null,
    participant_count: 0,
    last_message: null,
    ...overrides,
  };
}

describe("view-models/chat-list", () => {
  test("projects a chat row into camelCase with a boolean pin flag", () => {
    const vm = buildChatListViewModel({
      chats: [chat({ is_pinned: "pinned", participant_count: 3, last_message: "hi", },),],
      page: 1,
      pageSize: 50,
      total: 1,
    },);

    expect(vm.chats[0],).toEqual({
      id: "chat-1",
      name: "Tavern",
      type: "solo",
      isPinned: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      encryptionLevel: "none",
      worldName: null,
      locationName: null,
      participantCount: 3,
      lastMessage: "hi",
    },);
  });

  test("treats any non-pinned value as not pinned", () => {
    const vm = buildChatListViewModel({ chats: [chat(),], page: 1, pageSize: 50, total: 1, },);

    expect(vm.chats[0]?.isPinned,).toBe(false,);
  });

  test("carries the pagination cursor and total through", () => {
    const vm = buildChatListViewModel({ chats: [chat(),], page: 2, pageSize: 50, total: 130, },);

    expect(vm.page,).toBe(2,);
    expect(vm.pageSize,).toBe(50,);
    expect(vm.total,).toBe(130,);
  });

  test("hasMore is true only while pages remain", () => {
    expect(buildChatListViewModel({ chats: [], page: 1, pageSize: 50, total: 130, },).hasMore,).toBe(true,);
    expect(buildChatListViewModel({ chats: [], page: 3, pageSize: 50, total: 130, },).hasMore,).toBe(false,);
    expect(buildChatListViewModel({ chats: [], page: 1, pageSize: 50, total: 50, },).hasMore,).toBe(false,);
  });

  test("an empty page is an empty chats array, not an error", () => {
    const vm = buildChatListViewModel({ chats: [], page: 1, pageSize: 50, total: 0, },);

    expect(vm.chats,).toEqual([],);
    expect(vm.hasMore,).toBe(false,);
  });

  test("keeps raw unescaped text so the JSON branch carries real values", () => {
    const vm = buildChatListViewModel({
      chats: [chat({ name: "<b>x</b>", last_message: "& <script>", },),],
      page: 1,
      pageSize: 50,
      total: 1,
    },);

    expect(vm.chats[0]?.name,).toBe("<b>x</b>",);
    expect(vm.chats[0]?.lastMessage,).toBe("& <script>",);
  });
});
