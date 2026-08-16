import "./i18n.test-helper";
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { chatParticipants, } from "./chat-participants";
import type { ChatState, } from "./types";

// ── Mock apiFetch (chat-participants imports htmx + i18n) ──
// i18n uses the REAL module via i18n.test-helper above — do NOT mock.module
// "./i18n" here: mock.module is process-global, so a t:key => key stub leaks
// into sibling test files (e.g. world-channels.test.ts) sharing the worker,
// making their toast assertions receive raw keys instead of resolved strings.
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("./htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    if (!fetchHandler) { return new Response("{}", { status: 200, },); }
    return fetchHandler(url, opts ?? {},);
  },
}),);

function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
}

interface Toast {
  type: string;
  message: string;
}

function buildCtx(
  overrides: { activeChat?: string | null; chatType?: string; toasts?: Toast[] } = {},
): ChatState {
  const toasts: Toast[] = overrides.toasts ?? [];
  const base: Record<string, unknown> = {
    activeChat: overrides.activeChat === undefined ? "chat-1" : overrides.activeChat,
    currentChat: { id: "chat-1", type: overrides.chatType ?? "group", name: "Group", },
    _participants: [],
    _chatParticipants: [],
    _availableActors: [],
    _participantQuery: "",
    _participantsBusy: false,
    _selectedAddActorId: null,
    _selectedAddRole: "member",
    _turnOrder: null,
    $dispatch(event: string, detail: Record<string, unknown>,) {
      if (event === "show-toast") {
        toasts.push({ type: detail.type as string, message: detail.message as string, },);
      }
    },
  };
  // Preserve getters (isGroupChat, filteredAvailableActors) like the real
  // mergeReactiveSource — a plain spread would freeze them.
  for (const name of Object.getOwnPropertyNames(chatParticipants,)) {
    const desc = Object.getOwnPropertyDescriptor(chatParticipants, name,);
    if (!desc) { continue; }
    if ("value" in desc) { base[name] = desc.value; }
    else { Object.defineProperty(base, name, desc,); }
  }
  return base as unknown as ChatState;
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

describe("chatParticipants", () => {
  describe("loadParticipants", () => {
    test("populates _participants and syncs _chatParticipants for mentions", async () => {
      mockFetch(200, [
        {
          chat_id: "chat-1",
          actor_id: "a1",
          role_in_chat: "member",
          talkativity: 5,
          initiative: 0,
          joined_at: "",
          last_read_message_id: null,
          impersonate_actor_id: null,
          persona_id: null,
          display_name: "Alice",
          actor_type: "character",
        },
        {
          chat_id: "chat-1",
          actor_id: "a2",
          role_in_chat: "gm",
          talkativity: 8,
          initiative: 3,
          joined_at: "",
          last_read_message_id: null,
          impersonate_actor_id: null,
          persona_id: null,
          display_name: "Bob",
          actor_type: "character",
        },
      ],);
      const state = buildCtx();
      await chatParticipants.loadParticipants!.call(state,);
      expect(state._participants.length,).toBe(2,);
      expect(state._chatParticipants.length,).toBe(2,);
      expect(state._chatParticipants[0]?.actor_id,).toBe("a1",);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/participants",);
    });

    test("no-ops without an active chat", async () => {
      const state = buildCtx({ activeChat: null, },);
      await chatParticipants.loadParticipants!.call(state,);
      expect(fetchCalls,).toEqual([],);
    });
  });

  describe("loadAvailableActors", () => {
    test("skips loading for non-group chats", async () => {
      const state = buildCtx({ chatType: "direct", },);
      await chatParticipants.loadAvailableActors!.call(state,);
      expect(fetchCalls,).toEqual([],);
    });

    test("GETs /api/actors for group chats", async () => {
      mockFetch(200, [
        { id: "a3", display_name: "Carol", actor_type: "character", },
      ],);
      const state = buildCtx();
      await chatParticipants.loadAvailableActors!.call(state,);
      expect(fetchCalls[0]?.url,).toBe("/api/actors",);
      expect(state._availableActors.length,).toBe(1,);
    });
  });

  describe("loadTurnOrder", () => {
    test("fetches and stores the group-chat turn order", async () => {
      mockFetch(200, {
        turnOrder: {
          strategy: "round_robin",
          currentActorId: "a1",
          nextActorId: "a2",
          order: [
            {
              actor_id: "a1",
              display_name: "Alice",
              actor_type: "character",
              talkativity: 5,
              isCurrent: true,
              isNext: false,
            },
            {
              actor_id: "a2",
              display_name: "Bob",
              actor_type: "character",
              talkativity: 7,
              isCurrent: false,
              isNext: true,
            },
          ],
        },
      },);
      const state = buildCtx();
      await chatParticipants.loadTurnOrder!.call(state,);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/turn-order",);
      expect(state._turnOrder?.strategy,).toBe("round_robin",);
      expect(state._turnOrder?.nextActorId,).toBe("a2",);
      expect(state._turnOrder?.order.length,).toBe(2,);
      expect(state._turnOrder?.order[0]?.isCurrent,).toBe(true,);
    });

    test("no-ops for non-group chats", async () => {
      const state = buildCtx({ chatType: "direct", },);
      await chatParticipants.loadTurnOrder!.call(state,);
      expect(fetchCalls,).toEqual([],);
    });
  });

  describe("addParticipant", () => {
    test("POSTs and reloads the participant list", async () => {
      mockFetch(201, { id: "a3", },);
      const reload = mock(async () => {},);
      const state = buildCtx();
      state.loadParticipants = reload as unknown as ChatState["loadParticipants"];
      await chatParticipants.addParticipant!.call(state, "a3", "moderator",);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/participants",);
      expect(fetchCalls[0]?.opts.method,).toBe("POST",);
      expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ actorId: "a3", role: "moderator", },);
      expect(reload,).toHaveBeenCalled();
    });

    test("shows error toast on failure", async () => {
      mockFetch(403, { error: "forbidden", },);
      const toasts: Toast[] = [];
      const state = buildCtx({ toasts, },);
      await chatParticipants.addParticipant!.call(state, "a3",);
      expect(toasts[0]?.type,).toBe("error",);
    });
  });

  describe("removeParticipant", () => {
    test("DELETEs the participant", async () => {
      mockFetch(204, {},);
      const state = buildCtx();
      state._participants = [
        {
          chat_id: "chat-1",
          actor_id: "a1",
          role_in_chat: "member",
          talkativity: 5,
          initiative: 0,
          joined_at: "",
          last_read_message_id: null,
          impersonate_actor_id: null,
          persona_id: null,
          display_name: "Alice",
          actor_type: "character",
        },
      ] as unknown as ChatState["_participants"];
      await chatParticipants.removeParticipant!.call(state, "a1",);
      expect(fetchCalls[0]?.url,).toBe("/api/v1/chats/chat-1/participants/a1",);
      expect(fetchCalls[0]?.opts.method,).toBe("DELETE",);
    });
  });

  describe("updateParticipantTalkativity", () => {
    test("PUTs a clamped talkativity value and updates local state", async () => {
      mockFetch(200, { ok: true, },);
      const state = buildCtx();
      state._participants = [
        {
          chat_id: "chat-1",
          actor_id: "a1",
          role_in_chat: "member",
          talkativity: 5,
          initiative: 0,
          joined_at: "",
          last_read_message_id: null,
          impersonate_actor_id: null,
          persona_id: null,
          display_name: "Alice",
          actor_type: "character",
        },
      ] as unknown as ChatState["_participants"];
      await chatParticipants.updateParticipantTalkativity!.call(state, "a1", 99,);
      expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ talkativity: 10, },);
      expect(state._participants[0]?.talkativity,).toBe(10,);
    });
  });

  describe("updateParticipantInitiative", () => {
    test("PUTs the initiative value and updates local state", async () => {
      mockFetch(200, { ok: true, },);
      const state = buildCtx();
      state._participants = [
        {
          chat_id: "chat-1",
          actor_id: "a1",
          role_in_chat: "member",
          talkativity: 5,
          initiative: 0,
          joined_at: "",
          last_read_message_id: null,
          impersonate_actor_id: null,
          persona_id: null,
          display_name: "Alice",
          actor_type: "character",
        },
      ] as unknown as ChatState["_participants"];
      await chatParticipants.updateParticipantInitiative!.call(state, "a1", 7,);
      expect(JSON.parse(fetchCalls[0]?.opts.body as string,),).toEqual({ initiative: 7, },);
      expect(state._participants[0]?.initiative,).toBe(7,);
    });
  });

  describe("filteredAvailableActors", () => {
    test("excludes current members and filters by query", async () => {
      const state = buildCtx();
      state._participants = [
        {
          chat_id: "chat-1",
          actor_id: "a1",
          role_in_chat: "member",
          talkativity: 5,
          initiative: 0,
          joined_at: "",
          last_read_message_id: null,
          impersonate_actor_id: null,
          persona_id: null,
          display_name: "Alice",
          actor_type: "character",
        },
      ] as unknown as ChatState["_participants"];
      state._availableActors = [
        { id: "a1", display_name: "Alice", actor_type: "character", },
        { id: "a2", display_name: "Bob", actor_type: "character", },
        { id: "a3", display_name: "Carol", actor_type: "character", },
      ];
      state._participantQuery = "car";
      const result = state.filteredAvailableActors;
      expect(result.map((a,) => a.id),).toEqual(["a3",],);
    });
  });
});
