// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import { personaActions, } from "./persona";

// ── Mock apiFetch (chat-settings/persona imports ../htmx) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("../htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    if (!fetchHandler) { return new Response("{}", { status: 200, },); }
    return fetchHandler(url, opts ?? {},);
  },
}),);

function mockFetch(status: number, body: unknown = {},): void {
  fetchHandler = () => Response.json(body, { status, },);
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

function personaCtx(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    activeChat: "chat-1",
    _personas: [],
    _selectedPersonaId: null,
    _impersonatingActorId: null,
    _impersonationLoaded: false,
    impersonationActive: false,
    loadPersonas: personaActions.loadPersonas,
    ...overrides,
  };
}

describe("personaActions.loadPersonas", () => {
  test("stores personas on success", async () => {
    mockFetch(200, [{ id: "p1", },],);
    const ctx = personaCtx();
    await personaActions.loadPersonas!.call(ctx,);
    expect(ctx._personas,).toEqual([{ id: "p1", },],);
    expect(fetchCalls[0]!.url,).toBe("/api/personas",);
  },);

  test("ignores non-ok responses", async () => {
    mockFetch(500, {},);
    const ctx = personaCtx({ _personas: [{ id: "keep", },], },);
    await personaActions.loadPersonas!.call(ctx,);
    expect(ctx._personas,).toEqual([{ id: "keep", },],);
  },);

  test("ignores network errors", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const ctx = personaCtx();
    await expect(personaActions.loadPersonas!.call(ctx,),).resolves.toBeUndefined();
  },);
},);

describe("personaActions.setPersona", () => {
  test("returns early without an active chat", async () => {
    const ctx = personaCtx({ activeChat: null, },);
    await personaActions.setPersona!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  },);

  test("PUTs the selected persona id", async () => {
    mockFetch(200, {},);
    const ctx = personaCtx({ _selectedPersonaId: "p1", },);
    await personaActions.setPersona!.call(ctx,);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats/chat-1/persona",);
    expect(JSON.parse(fetchCalls[0]!.opts.body as string,),).toEqual({ personaId: "p1", },);
  },);

  test("PUTs null when no persona is selected", async () => {
    mockFetch(200, {},);
    const ctx = personaCtx({ _selectedPersonaId: null, },);
    await personaActions.setPersona!.call(ctx,);
    expect(JSON.parse(fetchCalls[0]!.opts.body as string,),).toEqual({ personaId: null, },);
  },);

  test("swallows network errors", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const ctx = personaCtx();
    await expect(personaActions.setPersona!.call(ctx,),).resolves.toBeUndefined();
  },);
},);

describe("personaActions.toggleImpersonation", () => {
  test("returns early without an active chat", async () => {
    const ctx = personaCtx({ activeChat: null, },);
    await personaActions.toggleImpersonation!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  },);

  test("starts impersonation with the actor id", async () => {
    mockFetch(200, {},);
    const ctx = personaCtx({ _impersonatingActorId: "actor-1", impersonationActive: true, },);
    await personaActions.toggleImpersonation!.call(ctx,);
    expect(JSON.parse(fetchCalls[0]!.opts.body as string,),).toEqual({ impersonateActorId: "actor-1", },);
  },);

  test("stops impersonation when inactive", async () => {
    mockFetch(200, {},);
    const ctx = personaCtx({ _impersonatingActorId: "actor-1", impersonationActive: false, },);
    await personaActions.toggleImpersonation!.call(ctx,);
    expect(JSON.parse(fetchCalls[0]!.opts.body as string,),).toEqual({ impersonateActorId: null, },);
  },);

  test("stops impersonation when no actor is selected", async () => {
    mockFetch(200, {},);
    const ctx = personaCtx({ _impersonatingActorId: null, impersonationActive: true, },);
    await personaActions.toggleImpersonation!.call(ctx,);
    expect(JSON.parse(fetchCalls[0]!.opts.body as string,),).toEqual({ impersonateActorId: null, },);
  },);
},);

describe("personaActions.loadImpersonationState", () => {
  test("returns early without an active chat", async () => {
    const ctx = personaCtx({ activeChat: null, },);
    await personaActions.loadImpersonationState!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
    expect(ctx._impersonationLoaded,).toBe(false,);
  },);

  test("returns early when already loaded", async () => {
    const ctx = personaCtx({ _impersonationLoaded: true, },);
    await personaActions.loadImpersonationState!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  },);

  test("reads the owner row and loads personas", async () => {
    mockFetch(200, [
      { role_in_chat: "member", persona_id: "px", impersonate_actor_id: null, },
      { role_in_chat: "owner", persona_id: "p7", impersonate_actor_id: "actor-7", },
    ],);
    let personasLoaded = 0;
    const ctx = personaCtx({ loadPersonas: async () => { personasLoaded++; }, },);
    await personaActions.loadImpersonationState!.call(ctx,);
    expect(ctx._impersonationLoaded,).toBe(true,);
    expect(ctx._selectedPersonaId,).toBe("p7",);
    expect(ctx._impersonatingActorId,).toBe("actor-7",);
    expect(ctx.impersonationActive,).toBe(true,);
    expect(personasLoaded,).toBe(1,);
  },);

  test("clears impersonation when the owner has no actor", async () => {
    mockFetch(200, [{ role_in_chat: "owner", persona_id: null, impersonate_actor_id: null, },],);
    const ctx = personaCtx({ loadPersonas: async () => {}, },);
    await personaActions.loadImpersonationState!.call(ctx,);
    expect(ctx._selectedPersonaId,).toBeNull();
    expect(ctx.impersonationActive,).toBe(false,);
  },);

  test("handles non-array payloads", async () => {
    mockFetch(200, { participants: [], },);
    let personasLoaded = 0;
    const ctx = personaCtx({ loadPersonas: async () => { personasLoaded++; }, },);
    await personaActions.loadImpersonationState!.call(ctx,);
    expect(ctx._impersonationLoaded,).toBe(true,);
    expect(personasLoaded,).toBe(1,);
  },);

  test("still loads personas when the fetch fails", async () => {
    mockFetch(500, {},);
    let personasLoaded = 0;
    const ctx = personaCtx({ loadPersonas: async () => { personasLoaded++; }, },);
    await personaActions.loadImpersonationState!.call(ctx,);
    expect(personasLoaded,).toBe(1,);
  },);

  test("marks loaded even on network error", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const ctx = personaCtx({ loadPersonas: async () => {}, },);
    await personaActions.loadImpersonationState!.call(ctx,);
    expect(ctx._impersonationLoaded,).toBe(true,);
  },);
},);

