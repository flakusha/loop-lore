// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, test, } from "bun:test";
import {
  createFolder,
  listChatTags,
  listFolders,
  resetOrganizationStores,
  tagChat,
  untagChat,
} from "./folders";

beforeEach(() => {
  resetOrganizationStores();
});

describe("createFolder", () => {
  test("creates a folder scoped to the user", () => {
    const folder = createFolder("u-1", "Stories",);
    expect(folder.id,).toMatch(/^[0-9a-f-]{36}$/i,);
    expect(folder.userId,).toBe("u-1",);
    expect(folder.name,).toBe("Stories",);
    expect(listFolders("u-1",).map((f,) => f.id,),).toEqual([folder.id,]);
  });

  test("folder name is case-insensitive unique per user", () => {
    const a = createFolder("u-1", "Stories",);
    const b = createFolder("u-1", "stories",);
    expect(b.id,).toBe(a.id,);
    expect(listFolders("u-1",),).toHaveLength(1,);
  });

  test("different users can keep folders of the same name", () => {
    const a = createFolder("u-1", "Stories",);
    const b = createFolder("u-2", "Stories",);
    expect(a.id,).not.toBe(b.id,);
    expect(listFolders("u-1",).map((f,) => f.id,),).toEqual([a.id,]);
    expect(listFolders("u-2",).map((f,) => f.id,),).toEqual([b.id,]);
  });

  test("rejects blank names", () => {
    expect(() => createFolder("u-1", "   ",),).toThrow(/cannot be empty/);
  });
});

describe("tagChat / untagChat", () => {
  test("add then list returns the tag", () => {
    tagChat("chat-1", "favorite",);
    expect(listChatTags("chat-1",),).toEqual(["favorite",]);
  });

  test("tagChat is idempotent", () => {
    tagChat("chat-1", "favorite",);
    tagChat("chat-1", "favorite",);
    expect(listChatTags("chat-1",),).toEqual(["favorite",]);
  });

  test("untagChat removes the tag and is idempotent", () => {
    tagChat("chat-1", "favorite",);
    tagChat("chat-1", "archive",);
    untagChat("chat-1", "favorite",);
    expect(listChatTags("chat-1",),).toEqual(["archive",]);
    untagChat("chat-1", "favorite",);
    expect(listChatTags("chat-1",),).toEqual(["archive",]);
  });

  test("blank tags are silently ignored", () => {
    tagChat("chat-1", "   ",);
    expect(listChatTags("chat-1",),).toEqual([],);
  });

  test("tags are isolated per chat", () => {
    tagChat("chat-1", "x",);
    tagChat("chat-2", "y",);
    expect(listChatTags("chat-1",),).toEqual(["x",]);
    expect(listChatTags("chat-2",),).toEqual(["y",]);
  });
});