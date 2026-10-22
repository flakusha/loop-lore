import "./i18n.test-helper";
import { afterEach, describe, expect, test, } from "bun:test";
import { chatLinkPreviewMethods, } from "./chat-link-previews";
import type { ChatState, LinkPreviewEntry, Message, } from "./types";

// ── Mock global apiFetch (chat-link-previews uses bare `apiFetch`) ──
let fetchCalls: string[] = [];
let fetchHandler: ((url: string,) => Response) | null = null;

type ApiFetch = (url: string, options?: RequestInit,) => Promise<Response>;
const globalApiFetch = globalThis as typeof globalThis & { apiFetch?: ApiFetch };
globalApiFetch.apiFetch = async (url: string,): Promise<Response> => {
  fetchCalls.push(url,);
  if (!fetchHandler) { return new Response("{}", { status: 200, },); }
  return fetchHandler(url,);
};

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

type PreviewState = Partial<ChatState> & {
  activeChat: string | null;
  _linkPreviews: Record<string, LinkPreviewEntry>;
};

const makeState = (): PreviewState => ({
  activeChat: "chat-1",
  _linkPreviews: {},
});

const msgWith = (content: string,): Message => ({
  id: "msg-1",
  role: "user",
  content,
  created_at: new Date().toISOString(),
});

describe("chatLinkPreviewMethods", () => {
  describe("linkPreviewUrlFor", () => {
    test("returns the first non-music URL", () => {
      const state = makeState();
      expect(chatLinkPreviewMethods.linkPreviewUrlFor!.call(state, msgWith("see https://example.com/a please",),),)
        .toBe("https://example.com/a",);
    });

    test("returns null for music links, tool results, and plain text", () => {
      const state = makeState();
      expect(chatLinkPreviewMethods.linkPreviewUrlFor!.call(state, msgWith("https://open.spotify.com/track/1",),),)
        .toBeNull();

      expect(chatLinkPreviewMethods.linkPreviewUrlFor!.call(state, msgWith("no links here",),),).toBeNull();
      const tool = msgWith("https://example.com/x",);
      tool.content_type = "tool_result";
      expect(chatLinkPreviewMethods.linkPreviewUrlFor!.call(state, tool,),).toBeNull();
    });
  });

  describe("loadLinkPreview", () => {
    test("caches the ready preview and hits the endpoint once", async () => {
      const state = makeState();
      fetchHandler = () =>
        Response.json({
          title: "Example",
          description: "desc",
          imageUrl: null,
        },);

      await chatLinkPreviewMethods.loadLinkPreview!.call(state, "https://example.com/a",);
      await chatLinkPreviewMethods.loadLinkPreview!.call(state, "https://example.com/a",);

      expect(fetchCalls,).toHaveLength(1,);
      expect(fetchCalls[0],).toBe("/api/v1/chats/chat-1/link-preview?url=https%3A%2F%2Fexample.com%2Fa",);
      expect(state._linkPreviews["https://example.com/a"],).toEqual({
        state: "ready",
        title: "Example",
        description: "desc",
        imageUrl: null,
      },);
    });

    test("records failed state on HTTP error", async () => {
      const state = makeState();
      fetchHandler = () => new Response("{}", { status: 400, },);

      await chatLinkPreviewMethods.loadLinkPreview!.call(state, "https://example.com/b",);

      expect(state._linkPreviews["https://example.com/b"]?.state,).toBe("failed",);
    });

    test("does nothing without an active chat", async () => {
      const state = makeState();
      state.activeChat = null;
      await chatLinkPreviewMethods.loadLinkPreview!.call(state, "https://example.com/c",);
      expect(fetchCalls,).toHaveLength(0,);
    });
  });
});
