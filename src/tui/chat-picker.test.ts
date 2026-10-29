// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ChatPicker (pi-tui): list rendering, selection, the `c` create prompt and
 * its Escape/Enter semantics — driven through the setFetch / setCreateChat
 * seams. Pure component — render(width), handleInput(raw), capturesInput.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { safeFetch, } from "../utils";
import type { FetchResult, SafeFetchOptions, } from "../utils/safe-fetch/types";
import { createChat, } from "./chat-create-api";
import {
  ChatPicker,
  CREATE_STATUS,
  CREATING_STATUS,
  loadChats,
  NO_CHATS_MESSAGE,
  setCreateChat,
  setFetch,
} from "./chat-picker";
import type { ChatSummary, } from "./chat-picker";
import { stripRows, tick, } from "./test-support";

const CHATS: ChatSummary[] = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Alpha", is_pinned: null, },
  { id: "22222222-2222-2222-2222-222222222222", name: "Beta", is_pinned: "archived", },
];

function stubChats(chats: ChatSummary[],): void {
  setFetch(<T,>(_url: string, _options?: SafeFetchOptions,): Promise<FetchResult<T>> =>
    Promise.resolve({
      ok: true,
      data: { data: chats, } as T,
      status: 200,
      headers: new Headers(),
    },)
  );
}

afterEach(() => {
  setFetch(safeFetch,);
  setCreateChat(createChat,);
},);

function build(onSelect: (chatId: string,) => void = () => {},): ChatPicker {
  return new ChatPicker({
    sessionToken: "tok",
    onSelect,
    getViewportRows: () => 20,
  },);
}

describe("ChatPicker", () => {
  it("loads chats on show and renders names with short ids", async () => {
    stubChats(CHATS,);
    const picked: string[] = [];
    const picker = build((chatId,) => picked.push(chatId,));
    picker.show();
    await tick(2,);

    const rows = stripRows(picker.render(60,),).join("\n",);
    expect(rows,).toContain("Alpha",);
    expect(rows,).toContain("Beta",);
    expect(rows,).toContain("(11111111…)",);
    expect(rows,).toContain("[archived]",);
    expect(rows,).toContain("2 chat(s) | Enter: bind chat",);
    expect(picker.isVisible(),).toBe(true,);
  });

  it("Enter on the highlighted row selects that chat", async () => {
    stubChats(CHATS,);
    const picked: string[] = [];
    const picker = build((chatId,) => picked.push(chatId,));
    picker.show();
    await tick(2,);

    picker.handleInput("\x1b[B",); // down to Beta
    picker.handleInput("\r",);
    expect(picked,).toEqual([CHATS[1]!.id,],);
  });

  it("vi keys move the cursor", async () => {
    stubChats(CHATS,);
    const picker = build();
    picker.show();
    await tick(2,);

    picker.handleInput("j",);
    const rows = stripRows(picker.render(60,),);
    expect(rows.some((row,) => row.includes("> [archived] Beta",)),).toBe(true,);
  });

  it("renders the empty state when no chats exist", async () => {
    stubChats([],);
    const picker = build();
    picker.show();
    await tick(2,);

    const rows = stripRows(picker.render(60,),).join("\n",);
    expect(rows,).toContain(NO_CHATS_MESSAGE,);
  });

  it("renders the load failure in place of the list", async () => {
    setFetch(<T,>(_url: string, _options?: SafeFetchOptions,): Promise<FetchResult<T>> =>
      Promise.resolve({
        ok: false,
        error: new Error("boom",),
        status: 500,
        headers: new Headers(),
      },)
    );

    const picker = build();
    picker.show();
    await tick(2,);

    const rows = stripRows(picker.render(60,),).join("\n",);
    expect(rows,).toContain("Failed to load chats: HTTP 500",);
  });

  it("`c` opens the prompt; typing routes into it and Enter commits", async () => {
    stubChats(CHATS,);
    const picked: string[] = [];
    const picker = build((chatId,) => picked.push(chatId,));
    picker.show();
    await tick(2,);

    picker.handleInput("c",);
    expect(picker.isPromptOpen(),).toBe(true,);
    expect(stripRows(picker.render(60,),).join("\n",),).toContain(CREATE_STATUS,);
    expect(picker.capturesInput("x",),).toBe(true,);
    expect(picker.capturesInput("\x1b",),).toBe(true,);
    expect(picker.capturesInput("\x1bOP",),).toBe(false,); // F1 stays with the shell

    picker.handleInput("n",);
    picker.handleInput("y",);
    setCreateChat(async () => ({ ok: true, chatId: "new-chat", }));
    picker.handleInput("\r",);
    await tick();

    expect(picked,).toEqual(["new-chat",],);
    expect(picker.isPromptOpen(),).toBe(false,);
  });

  it("Esc inside the prompt cancels it without closing the overlay", async () => {
    stubChats(CHATS,);
    const picker = build();
    picker.show();
    await tick(2,);

    picker.handleInput("c",);
    picker.handleInput("\x1b",);
    expect(picker.isPromptOpen(),).toBe(false,);
    expect(picker.isVisible(),).toBe(true,);
  });

  it("a blank name is rejected locally", async () => {
    stubChats(CHATS,);
    const picker = build();
    picker.show();
    await tick(2,);

    picker.handleInput("c",);
    picker.handleInput("\r",);
    expect(picker.isPromptOpen(),).toBe(false,);
    expect(picker.isCreating(),).toBe(false,);
  });

  it("a failed create lands the error on the footer", async () => {
    stubChats(CHATS,);
    const picker = build();
    picker.show();
    await tick(2,);

    picker.handleInput("c",);
    picker.handleInput("z",);
    setCreateChat(async () => ({ ok: false, error: "name taken", }));
    picker.handleInput("\r",);
    await tick();

    expect(picker.isCreating(),).toBe(false,);
    expect(stripRows(picker.render(60,),).join("\n",),).toContain("name taken",);
  });

  it("dismiss hides an open picker and reports it", async () => {
    stubChats(CHATS,);
    const picker = build();
    expect(picker.dismiss(),).toBe(false,);

    picker.show();
    await tick(2,);
    expect(picker.dismiss(),).toBe(true,);
    expect(picker.isVisible(),).toBe(false,);
  });

  it("empty-string session tokens run anonymous", async () => {
    stubChats([],);
    const picker = new ChatPicker({
      sessionToken: "",
      onSelect: () => {},
    },);

    picker.show();
    await tick(2,);
    expect(picker.isVisible(),).toBe(true,);
  });

  it("loadChats unwraps the envelope and maps a failed fetch to its message", async () => {
    stubChats(CHATS,);
    expect(await loadChats("tok",),).toEqual({ ok: true, data: CHATS, },);

    setFetch(<T,>(): Promise<FetchResult<T>> =>
      Promise.resolve({
        ok: false,
        error: new Error("boom",),
        status: 500,
        headers: new Headers(),
      },)
    );

    expect(await loadChats("tok",),).toEqual({ ok: false, error: "HTTP 500", },);
  });

  it("shows CREATING_STATUS while the create call is in flight", async () => {
    stubChats(CHATS,);
    const { promise, resolve, } = Promise.withResolvers<void>();
    setCreateChat(async () => {
      await promise;
      return { ok: true, chatId: "new-1", };
    },);

    const picked: string[] = [];
    const picker = build((chatId,) => picked.push(chatId,));
    picker.show();
    await tick(2,);

    picker.handleInput("c",);
    picker.handleInput("z",);
    picker.handleInput("e",);
    picker.handleInput("\r",);
    await tick();
    expect(stripRows(picker.render(60,),).join("\n",),).toContain(CREATING_STATUS,);
    expect(CREATING_STATUS,).toBe("Creating…",);

    resolve();
    await tick(4,);
    expect(picked,).toEqual(["new-1",],);
  });
});
