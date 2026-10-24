// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `src/cli/headless.ts` — the headless CLI HTTP layer.
 *
 * The HTTP client is injected (`setHeadlessFetch`), so no network is touched.
 * Covers: the CSRF preflight and cookie echo, JSON success/error bodies,
 * network failures, SSE stream consumption, and the multipart upload paths.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

import {
  HEADLESS_API_BASE,
  headlessAssetLink,
  headlessAssetUpload,
  headlessCharacterCreate,
  headlessCharacterImport,
  headlessChatCreate,
  headlessChatHistory,
  headlessChatSend,
  headlessGenerate,
  headlessGenerateStream,
  resetHeadlessCsrf,
  setHeadlessFetch,
} from "./headless";

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

const originalFetch = globalThis.fetch;
let calls: Call[] = [];

/**
 * Stub the HTTP client; `handler` answers every request.
 * @param handler - responder for the requested URL
 */
function stubFetch(handler: (url: string,) => Response | Promise<Response>,): void {
  const stub = Object.assign(
    async (input: FetchInput, init?: FetchInit,): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({
        url,
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers,),
        body: init?.body,
      },);

      return handler(url,);
    },
    { preconnect: fetch.preconnect, },
  );

  setHeadlessFetch(stub,);
}

/**
 * Default responder: the CSRF preflight answers with a cookie, every other
 * route answers with the same JSON payload.
 * @param payload - JSON body for non-preflight routes
 * @param status - HTTP status for non-preflight routes
 */
function jsonHandler(payload: unknown, status = 200,): (url: string,) => Response {
  return (url,) => {
    if (url.endsWith("/api/v1/auth/me",)) {
      return new Response("{}", {
        status: 200,
        headers: { "set-cookie": "csrf_token=tok-1; Path=/", },
      },);
    }

    return new Response(JSON.stringify(payload,), {
      status,
      headers: { "content-type": "application/json", },
    },);
  };
}

/** The recorded POST request whose URL ends with `suffix`. */
function postTo(suffix: string,): Call | undefined {
  return calls.find((c,) => c.method === "POST" && c.url.endsWith(suffix,));
}

beforeEach(() => {
  calls = [];
  resetHeadlessCsrf();
  stubFetch(jsonHandler({ id: "id-1", },),);
},);

afterEach(() => {
  resetHeadlessCsrf();
},);

afterAll(() => {
  setHeadlessFetch(originalFetch,);
},);

describe("headless chat", () => {
  it("creates a chat through the CSRF-preflighted JSON path", async () => {
    const res = await headlessChatCreate("My chat", undefined,);
    expect(res,).toEqual({ ok: true, data: { id: "id-1", }, },);

    const preflight = calls.find((c,) => c.url.endsWith("/api/v1/auth/me",));
    expect(preflight?.method,).toBe("GET",);

    const post = postTo("/api/v1/chats",);
    expect(post?.method,).toBe("POST",);
    expect(JSON.parse(String(post?.body,),),).toEqual({ name: "My chat", },);
    expect(post?.headers.get("X-CSRF-Token",),).toBe("tok-1",);
    expect(post?.headers.get("Cookie",),).toContain("csrf_token=tok-1",);
  });

  it("sends a message with the idempotency key and attachments", async () => {
    const res = await headlessChatSend("chat/1", "hi", "session-tok", {
      idempotencyKey: "k1",
      attachments: [{ assetId: "a1", },],
    },);

    expect(res,).toEqual({ ok: true, data: { id: "id-1", }, },);

    const post = postTo("/messages",);
    expect(post?.url,).toBe(`${HEADLESS_API_BASE}/api/v1/chats/chat%2F1/messages`,);
    expect(JSON.parse(String(post?.body,),),).toEqual({
      content: "hi",
      idempotencyKey: "k1",
      attachments: [{ assetId: "a1", },],
    },);

    expect(post?.headers.get("Authorization",),).toBe("Bearer session-tok",);
  });

  it("reads chat history with paging", async () => {
    stubFetch(jsonHandler({ data: [], total: 0, },),);
    const res = await headlessChatHistory("c1", undefined, 2, 5,);
    expect(res,).toEqual({ ok: true, data: { data: [], total: 0, }, },);

    const get = calls.find((c,) => c.url.includes("page=",));
    expect(get?.url,).toContain("/api/v1/chats/c1/messages?",);
    expect(get?.url,).toContain("page=2",);
    expect(get?.url,).toContain("pageSize=5",);
  });

  it("returns the server error body", async () => {
    stubFetch((url,) =>
      url.endsWith("/api/v1/auth/me",)
        ? new Response("{}", { status: 200, },)
        : new Response(JSON.stringify({ error: "boom", },), {
          status: 500,
          headers: { "content-type": "application/json", },
        },)
    );

    const res = await headlessChatCreate("x", undefined,);
    expect(res,).toEqual({ ok: false, error: "boom", status: 500, },);
  });

  it("reports a body that is not valid JSON", async () => {
    stubFetch((url,) =>
      url.endsWith("/api/v1/auth/me",)
        ? new Response("{}", { status: 200, },)
        : new Response("not json", { status: 200, },)
    );

    const res = await headlessChatCreate("x", undefined,);
    expect(res,).toEqual({ ok: false, error: "Response body is not valid JSON", status: 200, },);
  });

  it("surfaces a network failure", async () => {
    setHeadlessFetch(
      Object.assign(
        async () => {
          throw new Error("offline",);
        },
        { preconnect: fetch.preconnect, },
      ),
    );

    const res = await headlessChatCreate("x", undefined,);
    expect(res,).toEqual({ ok: false, error: "offline", },);
  });
});

describe("headless generation", () => {
  it("posts the generate body verbatim", async () => {
    stubFetch((url,) =>
      url.endsWith("/api/v1/generation/generate",)
        ? new Response(JSON.stringify({ messageId: "m1", content: "hi", },), {
          status: 200,
          headers: { "content-type": "application/json", },
        },)
        : jsonHandler({ id: "id-1", },)(url,)
    );

    const res = await headlessGenerate({
      chatId: "c1",
      parentMessageId: "p1",
      actorId: "a1",
      idempotencyKey: "k1",
    }, undefined,);

    expect(res,).toEqual({ ok: true, data: { messageId: "m1", content: "hi", }, },);

    const post = postTo("/api/v1/generation/generate",);
    expect(JSON.parse(String(post?.body,),),).toEqual({
      chatId: "c1",
      parentMessageId: "p1",
      actorId: "a1",
      idempotencyKey: "k1",
    },);
  });

  it("concatenates SSE stream updates", async () => {
    stubFetch((url,) =>
      url.includes("/api/v1/generation/stream/",)
        ? new Response("event: stream-update\ndata: hello\n\nevent: stream-done\ndata: \n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream", },
        },)
        : jsonHandler({},)(url,)
    );

    const res = await headlessGenerateStream("c1", undefined,);
    expect(res,).toEqual({ ok: true, data: { text: "hello", }, },);
  });

  it("reports a stream error frame", async () => {
    stubFetch((url,) =>
      url.includes("/api/v1/generation/stream/",)
        ? new Response("event: stream-error\ndata: kaboom\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream", },
        },)
        : jsonHandler({},)(url,)
    );

    const res = await headlessGenerateStream("c1", undefined,);
    expect(res,).toEqual({ ok: false, error: "kaboom", },);
  });

  it("reports a failed stream response", async () => {
    stubFetch((url,) =>
      url.includes("/api/v1/generation/stream/",)
        ? new Response("nope", { status: 503, },)
        : jsonHandler({},)(url,)
    );

    const res = await headlessGenerateStream("c1", undefined,);
    expect(res,).toEqual({ ok: false, error: "nope", status: 503, },);
  });
});

describe("headless assets", () => {
  it("uploads a file as multipart form data", async () => {
    const path = join(tmpdir(), "headless-upload.txt",);
    await Bun.write(path, "hello",);

    const res = await headlessAssetUpload(path, undefined, "alt text",);
    expect(res,).toEqual({ ok: true, data: { id: "id-1", }, },);

    const post = postTo("/api/v1/assets",);
    expect(post?.method,).toBe("POST",);
    const form = post?.body as FormData;
    expect(form.get("alt_text",),).toBe("alt text",);
    expect(form.get("file",),).toBeTruthy();
  });

  it("reports a missing file", async () => {
    const path = join(tmpdir(), "headless-missing-file.txt",);
    const res = await headlessAssetUpload(path, undefined,);
    expect(res,).toEqual({ ok: false, error: `file not found: ${path}`, },);
  });

  it("links an asset to a chat", async () => {
    const res = await headlessAssetLink("a1", "c1", undefined,);
    expect(res,).toEqual({ ok: true, data: { id: "id-1", }, },);

    const post = postTo("/links",);
    expect(post?.url,).toBe(`${HEADLESS_API_BASE}/api/v1/assets/a1/links`,);
    expect(JSON.parse(String(post?.body,),),).toEqual({ entityType: "chat", entityId: "c1", },);
  });
});

describe("headless characters", () => {
  it("creates a character with the optional fields mapped", async () => {
    const res = await headlessCharacterCreate({
      displayName: "Ada",
      description: "d",
      assetId: "asset-9",
    }, undefined,);

    expect(res,).toEqual({ ok: true, data: { id: "id-1", }, },);

    const post = postTo("/api/v1/actors",);
    expect(JSON.parse(String(post?.body,),),).toEqual({
      displayName: "Ada",
      description: "d",
      assetId: "asset-9",
    },);
  });

  it("imports a character card file", async () => {
    const path = join(tmpdir(), "headless-card.json",);
    await Bun.write(path, JSON.stringify({ name: "Ada", },),);

    const res = await headlessCharacterImport(path, undefined,);
    expect(res,).toEqual({ ok: true, data: { id: "id-1", }, },);

    const post = postTo("/api/v1/actors/import",);
    expect(post?.method,).toBe("POST",);
    expect((post?.body as FormData).get("file",),).toBeTruthy();
  });
});
