// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for headless `bin/lolo.ts` subcommands + `src/cli/headless.ts`.
 *
 * Dispatch layer: `bin/lolo.ts` prints usage errors without touching the
 * network. HTTP layer: `setHeadlessFetch` pins responses in-process.
 */

import { beforeEach, describe, expect, test, } from "bun:test";
import {
  headlessAssetUpload,
  headlessCharacterCreate,
  headlessChatCreate,
  headlessChatSend,
  headlessGenerate,
  headlessGenerateStream,
  resetHeadlessCsrf,
  setHeadlessFetch,
} from "../src/cli/headless";
import { jsonStringifyOr, safeJsonParse, } from "../src/utils";

beforeEach(() => {
  resetHeadlessCsrf();
},);

function stubRoutes(routes: Record<string, { status: number; body: unknown }>,) {
  const calls: { url: string; method: string; auth: string | null; body: unknown }[] = [];
  setHeadlessFetch(
    (async (url: string | URL | Request, init?: RequestInit,) => {
      const urlStr = String(url,);
      const headers = new Headers(init?.headers,);
      let body: unknown = null;
      const parsed = init?.body ? safeJsonParse(String(init.body,),) : null;
      body = parsed ? (parsed.ok ? parsed.value ?? "non-json" : "non-json") : null;
      calls.push({ url: urlStr, method: init?.method ?? "GET", auth: headers.get("authorization",), body, },);
      const path = new URL(urlStr,).pathname;
      const route = routes[path] ??
        (path === "/api/v1/auth/me" ? { status: 200, body: {}, } : { status: 404, body: { error: "not found", }, });

      return new Response(jsonStringifyOr(route.body,), {
        status: route.status,
        headers: { "Content-Type": "application/json", },
      },);
    }) as typeof fetch,
  );

  return calls;
}

function stubSse(frame: string,) {
  setHeadlessFetch(
    (async () =>
      new Response(frame, {
        status: 200,
        headers: { "Content-Type": "text/event-stream", },
      },)) as unknown as typeof fetch,
  );
}

describe("headless HTTP layer", () => {
  test("chat create posts name and reads id", async () => {
    const calls = stubRoutes({ "/api/v1/chats": { status: 201, body: { id: "chat-1", }, }, },);
    const result = await headlessChatCreate("x", undefined,);
    expect(result,).toEqual({ ok: true, data: { id: "chat-1", }, },);
    expect(calls.at(-1,)?.body,).toEqual({ name: "x", },);
    expect(calls.at(-1,)?.auth,).toBeNull();
  });

  test("chat send carries the bearer token", async () => {
    const calls = stubRoutes({ "/api/v1/chats/chat-1/messages": { status: 201, body: { id: "msg-1", }, }, },);
    const result = await headlessChatSend("chat-1", "hi", "tok",);
    expect(result.ok,).toBe(true,);
    expect(calls.at(-1,)?.auth,).toBe("Bearer tok",);
  });

  test("chat send error surfaces message with status", async () => {
    stubRoutes({ "/api/v1/chats/c/messages": { status: 401, body: { error: "unauthorized", }, }, },);
    const result = await headlessChatSend("c", "hi", undefined,);
    expect(result,).toEqual({ ok: false, error: "unauthorized", status: 401, },);
  });

  test("generate posts the full body with client key", async () => {
    const calls = stubRoutes({
      "/api/v1/generation/generate": { status: 200, body: { messageId: "m", content: "hi", }, },
    },);

    const body = { chatId: "c", parentMessageId: "p", actorId: "a", idempotencyKey: "k", };
    const result = await headlessGenerate(body, undefined,);
    expect(result.ok,).toBe(true,);
    expect(calls.at(-1,)?.body,).toEqual(body,);
  });

  test("generate stream concatenates stream-update frames", async () => {
    stubSse("event: stream-update\ndata: hel\n\nevent: stream-update\ndata: lo\n\nevent: stream-done\ndata: {}\n\n",);
    const result = await headlessGenerateStream("c", undefined,);
    expect(result,).toEqual({ ok: true, data: { text: "hello", }, },);
  });

  test("generate stream surfaces stream-error as failure", async () => {
    stubSse("event: stream-error\ndata: boom\n\n",);
    const result = await headlessGenerateStream("c", undefined,);
    expect(result,).toEqual({ ok: false, error: "boom", },);
  });

  test("asset upload of a missing file fails without fetch", async () => {
    const calls = stubRoutes({},);
    const result = await headlessAssetUpload("/nope/missing.png", undefined,);
    expect(result.ok,).toBe(false,);
    expect(calls,).toHaveLength(0,);
  });

  test("character create posts displayName with avatar assetId", async () => {
    const calls = stubRoutes({ "/api/v1/actors": { status: 201, body: { id: "actor-1", }, }, },);
    const result = await headlessCharacterCreate({ displayName: "N", assetId: "asset-1", }, undefined,);
    expect(result.ok,).toBe(true,);
    expect(calls.at(-1,)?.body,).toEqual({ displayName: "N", assetId: "asset-1", },);
  });

  test("chat create bootstraps CSRF then sends cookie and header", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const jar = new Response("{}", { headers: { "Set-Cookie": "csrf_token=tok123; Path=/", }, },);
    setHeadlessFetch(
      (async (url: string | URL | Request, init?: RequestInit,) => {
        const urlStr = String(url,);
        seen.push({ url: urlStr, headers: Object.fromEntries(new Headers(init?.headers,).entries(),), },);
        if (new URL(urlStr,).pathname === "/api/v1/auth/me") { return jar; }
        return new Response(jsonStringifyOr({ id: "chat-1", },), {
          status: 201,
          headers: { "Content-Type": "application/json", },
        },);
      }) as typeof fetch,
    );

    const result = await headlessChatCreate("x", undefined,);

    expect(result.ok,).toBe(true,);
    expect(seen.map((s,) => s.url),).toContain("http://localhost:3000/api/v1/auth/me",);
    const post = seen.at(-1,)!;
    expect(post.headers["cookie"],).toContain("csrf_token=tok123",);
    expect(post.headers["x-csrf-token"],).toBe("tok123",);
  });
});

describe("bin/lolo.ts dispatch", () => {
  const BIN = new URL("./lolo.ts", import.meta.url,).pathname;

  function run(...args: string[]) {
    const proc = Bun.spawnSync(["bun", BIN, ...args,],);
    return { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString(), };
  }

  test("help exits 0 without network", () => {
    const result = run("--help",);
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("chat create",);
  });

  test("chat send without message exits 2 with usage", () => {
    const result = run("chat", "send", "chat-1",);
    expect(result.exitCode,).toBe(2,);
    expect(result.stderr,).toContain("usage: lolo chat send",);
  });

  test("generate without required flags exits 2 with usage", () => {
    const result = run("generate", "--chat-id", "c",);
    expect(result.exitCode,).toBe(2,);
    expect(result.stderr,).toContain("usage: lolo generate",);
  });

  test("unknown subcommand exits 2", () => {
    const result = run("frobnicate", "--json",);
    expect(result.exitCode,).toBe(2,);
  });

  test("server-down chat create exits non-zero with error JSON", () => {
    const result = Bun.spawnSync(
      ["bun", BIN, "chat", "create", "--name", "x", "--json",],
      { env: { ...process.env, LOOP_LORE_API_BASE_URL: "http://127.0.0.1:1", }, },
    );

    expect(result.exitCode,).not.toBe(0,);
    const parsed = safeJsonParse<{ error?: string }>(result.stdout.toString(),);
    expect(parsed.ok,).toBe(true,);
    if (parsed.ok) { expect(parsed.value,).toHaveProperty("error",); }
  });
});
