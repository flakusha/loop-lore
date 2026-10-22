import "./i18n.test-helper";
import { afterEach, describe, expect, test, } from "bun:test";
import { chatPollMethods, } from "./chat-polls";
import type { ChatState, Message, MessagePoll, } from "./types";

// ── Mock global apiFetch (chat-polls uses bare `apiFetch` = globalThis.apiFetch) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response | Promise<Response>) | null = null;

type ApiFetch = (url: string, options?: RequestInit,) => Promise<Response>;
const globalApiFetch = globalThis as typeof globalThis & { apiFetch?: ApiFetch };
globalApiFetch.apiFetch = async (url: string, opts?: RequestInit,) => {
  fetchCalls.push({ url, opts: opts ?? {}, },);
  if (!fetchHandler) { return new Response("{}", { status: 200, },); }
  return fetchHandler(url, opts ?? {},);
};

/**
 * @param status
 * @param body
 */
function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
}

/** Test state whose `messages` is always defined (narrowed from Partial<ChatState>). */
type PollState = Partial<ChatState> & { messages: Message[] };

const mockPoll = (messageId: string,): MessagePoll => ({
  id: "poll-1",
  messageId,
  question: "Pick",
  options: ["A", "B",],
  multi: false,
  closed: false,
  closesAt: null,
  createdBy: "u-owner",
  tallies: [],
  viewerOptionIdxs: [],
});

const mockMessage = (id: string,): Message => ({
  id,
  role: "user",
  content: "hi",
  created_at: new Date().toISOString(),
});

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

describe("chatPollMethods", () => {
  describe("votePollOption", () => {
    test("posts the vote and applies the returned poll", async () => {
      const poll = mockPoll("msg-1",);
      const msg = mockMessage("msg-1",);
      msg.poll = poll;
      mockFetch(200, poll,);
      const state: PollState = { activeChat: "chat-1", messages: [msg,], };

      await chatPollMethods.votePollOption!.call(state, "msg-1", 1,);

      const post = fetchCalls.find((c,) => c.opts?.method === "POST");
      expect(post?.url,).toBe("/api/v1/messages/msg-1/poll/vote",);
      expect(JSON.parse(String(post?.opts.body,),),).toEqual({ optionIdx: 1, },);
      expect(state.messages[0]!.poll,).toEqual(poll,);
    });

    test("does nothing when the message has no poll", async () => {
      const state: PollState = { activeChat: "chat-1", messages: [mockMessage("msg-1",),], };
      await chatPollMethods.votePollOption!.call(state, "msg-1", 0,);
      expect(fetchCalls,).toHaveLength(0,);
    });

    test("does nothing when the poll is closed", async () => {
      const poll = { ...mockPoll("msg-1",), closed: true, };
      const msg = mockMessage("msg-1",);
      msg.poll = poll;
      const state: PollState = { activeChat: "chat-1", messages: [msg,], };
      await chatPollMethods.votePollOption!.call(state, "msg-1", 0,);
      expect(fetchCalls,).toHaveLength(0,);
    });

    test("leaves the poll untouched when the server rejects", async () => {
      const poll = mockPoll("msg-1",);
      const msg = mockMessage("msg-1",);
      msg.poll = poll;
      const state: PollState = { activeChat: "chat-1", messages: [msg,], };
      mockFetch(409, { error: "closed", },);

      await chatPollMethods.votePollOption!.call(state, "msg-1", 0,);

      expect(state.messages[0]!.poll,).toBe(poll,);
    });
  });

  describe("loadChatPolls", () => {
    test("attaches chat polls to their messages", async () => {
      const poll = mockPoll("msg-2",);
      mockFetch(200, [poll,],);
      const state: PollState = {
        activeChat: "chat-1",
        messages: [mockMessage("msg-1",), mockMessage("msg-2",),],
      };

      await chatPollMethods.loadChatPolls!.call(state,);

      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/polls",);
      expect(state.messages[1]!.poll,).toEqual(poll,);
      expect(state.messages[0]!.poll,).toBeUndefined();
    });

    test("skips the fetch without an active chat", async () => {
      const state: PollState = { activeChat: null, messages: [], };
      await chatPollMethods.loadChatPolls!.call(state,);
      expect(fetchCalls,).toHaveLength(0,);
    });

    test("ignores malformed payloads", async () => {
      mockFetch(200, { not: "a list", },);
      const state: PollState = { activeChat: "chat-1", messages: [mockMessage("msg-1",),], };
      await chatPollMethods.loadChatPolls!.call(state,);
      expect(state.messages[0]!.poll,).toBeUndefined();
    });
  });

  describe("composer", () => {
    test("open/close manage the draft", () => {
      const state: PollState = { activeChat: "chat-1", messages: [], };
      chatPollMethods.openPollComposer!.call(state, "msg-1",);
      expect(state._pollComposer,).toEqual({
        messageId: "msg-1",
        question: "",
        optionsText: "",
        multi: false,
      },);

      chatPollMethods.closePollComposer!.call(state,);
      expect(state._pollComposer,).toBeNull();
    });

    test("createMessagePoll rejects drafts without two options", async () => {
      const state: PollState = { activeChat: "chat-1", messages: [mockMessage("msg-1",),], };
      chatPollMethods.openPollComposer!.call(state, "msg-1",);
      state._pollComposer!.question = "Pick";
      state._pollComposer!.optionsText = "only-one";

      await chatPollMethods.createMessagePoll!.call(state,);

      expect(fetchCalls,).toHaveLength(0,);
      expect(state._pollComposer,).not.toBeNull();
    });

    test("createMessagePoll posts trimmed options and closes the composer", async () => {
      const poll = mockPoll("msg-1",);
      mockFetch(200, poll,);
      const state: PollState = { activeChat: "chat-1", messages: [mockMessage("msg-1",),], };
      chatPollMethods.openPollComposer!.call(state, "msg-1",);
      state._pollComposer!.question = " Pick ";
      state._pollComposer!.optionsText = "A\nB\n";

      await chatPollMethods.createMessagePoll!.call(state,);

      const post = fetchCalls.find((c,) => c.opts?.method === "POST");
      expect(post?.url,).toBe("/api/v1/messages/msg-1/poll",);
      expect(JSON.parse(String(post?.opts.body,),),).toEqual({
        question: "Pick",
        options: ["A", "B",],
        multi: false,
      },);

      expect(state.messages[0]!.poll,).toEqual(poll,);
      expect(state._pollComposer,).toBeNull();
    });
  });

  describe("closeMessagePoll", () => {
    test("posts close and applies the closed poll", async () => {
      const poll = { ...mockPoll("msg-1",), closed: true, };
      mockFetch(200, poll,);
      const state: PollState = { activeChat: "chat-1", messages: [mockMessage("msg-1",),], };

      await chatPollMethods.closeMessagePoll!.call(state, "msg-1",);

      const post = fetchCalls.find((c,) => c.opts?.method === "POST");
      expect(post?.url,).toBe("/api/v1/messages/msg-1/poll/close",);
      expect(state.messages[0]!.poll,).toEqual(poll,);
    });
  });
});
