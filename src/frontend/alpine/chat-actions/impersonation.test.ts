import { afterEach, describe, expect, mock, test, } from "bun:test";
import { impersonation, } from "./impersonation";

// ── Mock ../htmx (must precede importing ./impersonation) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

mock.module("../htmx", () => ({
  apiFetch: (async (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

interface Toast {
  type: string;
  message: string;
}

interface ImpersonationCtx {
  activeChat: string | null;
  currentCharacter: { id: string; display_name?: string; name?: string } | null;
  impersonationActive: boolean;
  impersonatingActorId: string | null;
  userRole: string;
  userDisplayName: string;
  toggleImpersonate?: () => Promise<void>;
  toasts: Toast[];
  $dispatch?: (event: string, detail?: unknown,) => void;
}

function buildCtx(overrides?: Partial<ImpersonationCtx>,): ImpersonationCtx {
  const ctx: ImpersonationCtx = {
    activeChat: "chat-1",
    currentCharacter: { id: "actor-9", display_name: "The GM", name: "gm", },
    impersonationActive: false,
    impersonatingActorId: null,
    userRole: "user",
    userDisplayName: "me",
    toasts: [],
    $dispatch: (event, detail,) => {
      if (event === "show-toast") {
        ctx.toasts.push(detail as Toast,);
      }
    },
    ...overrides,
  };
  return ctx;
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

describe("impersonation.toggleImpersonate", () => {
  test("warns when there is no chat or character", async () => {
    const ctx = buildCtx({ activeChat: null, currentCharacter: null, },);
    await impersonation.toggleImpersonate!.call(ctx as never,);
    expect(ctx.toasts,).toEqual([{ type: "warning", message: expect.any(String,), },],);
    expect(calls,).toEqual([],);
  });

  test("starts impersonation on success", async () => {
    const ctx = buildCtx();
    await impersonation.toggleImpersonate!.call(ctx as never,);
    expect(calls[0]!.url,).toBe("/api/v1/chats/chat-1/impersonate",);
    expect(calls[0]!.opts.method,).toBe("PUT",);
    expect(JSON.parse(String(calls[0]!.opts.body,),),).toEqual({ impersonateActorId: "actor-9", },);
    expect(ctx.impersonationActive,).toBe(true,);
    expect(ctx.impersonatingActorId,).toBe("actor-9",);
    expect(ctx.toasts[0]!.type,).toBe("info",);
  });

  test("starts impersonation using empty name when display_name missing", async () => {
    const ctx = buildCtx({ currentCharacter: { id: "a1", display_name: "", name: "", }, },);
    await impersonation.toggleImpersonate!.call(ctx as never,);
    expect(ctx.impersonationActive,).toBe(true,);
    expect(ctx.toasts[0]!.type,).toBe("info",);
  });

  test("shows the server error when starting fails", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ error: "denied", }, { status: 403, },);
    await impersonation.toggleImpersonate!.call(ctx as never,);
    expect(ctx.impersonationActive,).toBe(false,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "denied", },],);
  });

  test("falls back to a generic message when the error body has no error field", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({}, { status: 500, },);
    await impersonation.toggleImpersonate!.call(ctx as never,);
    expect(ctx.toasts[0]!.type,).toBe("error",);
  });

  test("ends impersonation on success", async () => {
    const ctx = buildCtx({ impersonationActive: true, impersonatingActorId: "actor-9", },);
    await impersonation.toggleImpersonate!.call(ctx as never,);
    expect(JSON.parse(String(calls[0]!.opts.body,),),).toEqual({ impersonateActorId: null, },);
    expect(ctx.impersonationActive,).toBe(false,);
    expect(ctx.impersonatingActorId,).toBeNull();
    expect(ctx.toasts[0]!.type,).toBe("info",);
  });

  test("shows the server error when ending fails", async () => {
    const ctx = buildCtx({ impersonationActive: true, },);
    handler = async () => Response.json({ error: "still busy", }, { status: 409, },);
    await impersonation.toggleImpersonate!.call(ctx as never,);
    expect(ctx.impersonationActive,).toBe(true,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "still busy", },],);
  });

  test("network failures produce an error toast without state changes", async () => {
    const ctx = buildCtx();
    handler = async () => {
      throw new Error("offline",);
    };
    await impersonation.toggleImpersonate!.call(ctx as never,);
    expect(ctx.impersonationActive,).toBe(false,);
    expect(ctx.toasts[0]!.type,).toBe("error",);
  });
});

describe("impersonation.impersonate", () => {
  test("delegates to toggleImpersonate regardless of command", async () => {
    const ctx = buildCtx();
    let toggles = 0;
    ctx.toggleImpersonate = async () => {
      toggles += 1;
    };
    await impersonation.impersonate!.call(ctx as never, "char",);
    await impersonation.impersonate!.call(ctx as never, "impersonate",);
    expect(toggles,).toBe(2,);
  });
});

describe("impersonation.loadImpersonationState", () => {
  test("does nothing without an active chat", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await impersonation.loadImpersonationState!.call(ctx as never,);
    expect(calls,).toEqual([],);
  });

  test("returns silently on non-ok responses", async () => {
    const ctx = buildCtx();
    handler = async () => new Response("", { status: 500, },);
    await impersonation.loadImpersonationState!.call(ctx as never,);
    expect(ctx.impersonationActive,).toBe(false,);
  });

  test("activates when the current user is impersonating", async () => {
    const ctx = buildCtx({ userRole: "gm", },);
    handler = async () =>
      Response.json({
        data: [{ actor_id: "gm", impersonate_actor_id: "actor-3", },],
      },);
    await impersonation.loadImpersonationState!.call(ctx as never,);
    expect(ctx.impersonationActive,).toBe(true,);
    expect(ctx.impersonatingActorId,).toBe("actor-3",);
  });

  test("deactivates when the current user is not impersonating", async () => {
    const ctx = buildCtx({ impersonationActive: true, impersonatingActorId: "x", userRole: "gm", },);
    handler = async () =>
      Response.json({
        data: [{ actor_id: "gm", impersonate_actor_id: null, },],
      },);
    await impersonation.loadImpersonationState!.call(ctx as never,);
    expect(ctx.impersonationActive,).toBe(false,);
    expect(ctx.impersonatingActorId,).toBeNull();
  });

  test("matches the current user by display name when actor_id differs", async () => {
    const ctx = buildCtx({ userRole: "nobody", userDisplayName: "mee", },);
    handler = async () =>
      Response.json({
        data: [{ actor_id: "other", display_name: "mee", impersonate_actor_id: "actor-5", },],
      },);
    await impersonation.loadImpersonationState!.call(ctx as never,);
    expect(ctx.impersonationActive,).toBe(true,);
    expect(ctx.impersonatingActorId,).toBe("actor-5",);
  });

  test("adopts an in-flight impersonation when the user has no participant row", async () => {
    const ctx = buildCtx({ userRole: "nobody", userDisplayName: "mee", },);
    handler = async () =>
      Response.json({
        data: [{ actor_id: "other", impersonate_actor_id: "actor-7", },],
      },);
    await impersonation.loadImpersonationState!.call(ctx as never,);
    expect(ctx.impersonationActive,).toBe(true,);
    expect(ctx.impersonatingActorId,).toBe("actor-7",);
  });

  test("stays inactive when no participant impersonates anyone", async () => {
    const ctx = buildCtx({ userRole: "nobody", userDisplayName: "mee", },);
    handler = async () =>
      Response.json({
        data: [{ actor_id: "other", impersonate_actor_id: null, },],
      },);
    await impersonation.loadImpersonationState!.call(ctx as never,);
    expect(ctx.impersonationActive,).toBe(false,);
    expect(ctx.impersonatingActorId,).toBeNull();
  });

  test("tolerates a missing data envelope and network failures", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({},);
    await impersonation.loadImpersonationState!.call(ctx as never,);
    expect(ctx.impersonationActive,).toBe(false,);
    handler = async () => {
      throw new Error("offline",);
    };
    await impersonation.loadImpersonationState!.call(ctx as never,);
    expect(ctx.impersonationActive,).toBe(false,);
  });
});
