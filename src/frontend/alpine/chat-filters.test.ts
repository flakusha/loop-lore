import { describe, expect, mock, test, } from "bun:test";
import { chatFilters, } from "./chat-filters";

describe("chatFilters", () => {
  describe("_filterParams", () => {
    test("defaults to pageSize only when no filters active", () => {
      const ctx = { _chatType: "all", _chatStatus: "all", _chatSort: "recent", };
      const params = chatFilters._filterParams!.call(ctx,);
      expect(params,).toBe("pageSize=200",);
    });

    test("emits type when not 'all'", () => {
      const ctx = { _chatType: "group", _chatStatus: "all", _chatSort: "recent", };
      const params = chatFilters._filterParams!.call(ctx,);
      expect(params,).toContain("type=group",);
    });

    test("maps _chatStatus active -> archived=false", () => {
      const ctx = { _chatType: "all", _chatStatus: "active", _chatSort: "recent", };
      const params = chatFilters._filterParams!.call(ctx,);
      expect(params,).toContain("archived=false",);
    });

    test("maps _chatStatus archived -> archived=true", () => {
      const ctx = { _chatType: "all", _chatStatus: "archived", _chatSort: "recent", };
      const params = chatFilters._filterParams!.call(ctx,);
      expect(params,).toContain("archived=true",);
    });

    test("emits sort when not 'recent'", () => {
      const ctx = { _chatType: "all", _chatStatus: "all", _chatSort: "pinned-first", };
      const params = chatFilters._filterParams!.call(ctx,);
      expect(params,).toContain("sort=pinned-first",);
    });

    test("omits 'all' status entirely", () => {
      const ctx = { _chatType: "direct", _chatStatus: "all", _chatSort: "name", };
      const params = chatFilters._filterParams!.call(ctx,);
      expect(params,).toContain("type=direct",);
      expect(params,).toContain("sort=name",);
      expect(params,).not.toContain("archived",);
    });
  });

  describe("applyChatFilters", () => {
    test("clears search results and reloads the chat list", async () => {
      let reloaded = 0;
      const ctx = {
        _searchResults: [{ chatId: "c1", chatName: "n", characterName: "cn", characterAvatar: null, },],
        loadChats: mock(async () => {
          reloaded++;
        },),
      };
      await chatFilters.applyChatFilters!.call(ctx,);
      expect(ctx._searchResults,).toEqual([],);
      expect(reloaded,).toBe(1,);
    });
  });
});
