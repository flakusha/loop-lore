// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { filterChatList, findActiveChat, } from "./selectors";

describe("filterChatList", () => {
  test("empty filter returns the list as-is", () => {
    const chats = [{ id: "a", name: "Alpha", },];
    expect(filterChatList(chats, "",),).toBe(chats,);
  });

  test("matches case-insensitively on name", () => {
    const chats = [{ id: "a", name: "Alpha", }, { id: "b", name: "beta", },];
    expect(filterChatList(chats, "ALP",).map((c,) => c.id),).toEqual(["a",],);
  });

  test("nameless entries never match a non-empty filter", () => {
    expect(filterChatList([{ id: "a", },], "x",),).toEqual([],);
  });
});

describe("findActiveChat", () => {
  test("returns the chat with the active id", () => {
    const chats = [{ id: "a", }, { id: "b", },];
    expect(findActiveChat(chats, "b",),).toEqual({ id: "b", },);
  });

  test("returns null when unset or missing", () => {
    expect(findActiveChat([{ id: "a", },], null,),).toBeNull();
    expect(findActiveChat([{ id: "a", },], "zz",),).toBeNull();
  });
});
