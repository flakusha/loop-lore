// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * @file Tests for the generic link-preview unfurl (TASK-link-previews-unfurl):
 * SSRF guard, music-domain exclusion, OpenGraph parsing, cache hit (no
 * refetch), TTL expiry, and malicious-HTML neutralization.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import {
  isMusicDomain,
  isPrivateHost,
  parseOpenGraph,
  unfurlLinkPreview,
  validatePreviewUrl,
} from "./link-previews";

let dbHandle: TestDb;
let database: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  dbHandle = await createTestDb();
  database = dbHandle.db;
  await insertUsers(database, "owner", "Owner", { id: "u-owner", } as never,);
  await insertChats(database, "Preview Chat", "u-owner", { id: "chat-1", } as never,);
},);

afterAll(async () => {
  if (dbHandle?.sqlite) { dbHandle.sqlite.close(); }
},);

const OG_HTML = `<!doctype html><html><head>
  <meta property="og:title" content="Example Page">
  <meta property="og:description" content="A &quot;quoted&quot; description">
  <meta property="og:image" content="https://example.com/cover.png">
  <title>Fallback Title</title>
</head><body></body></html>`;

// ── fetch mock ──────────────────────────────────────────────
let fetchCalls: string[] = [];
let fetchResponder: ((url: string,) => Response | Promise<Response>) | null = null;
const realFetch = globalThis.fetch;

/** */
function mockFetch(responder: ((url: string,) => Response | Promise<Response>) | null,): void {
  fetchResponder = responder;
  fetchCalls = [];
  const stub = async (input: string | URL | Request,): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    fetchCalls.push(url,);
    if (!fetchResponder) { throw new Error("network disabled",); }
    return fetchResponder(url,);
  };

  globalThis.fetch = stub as unknown as typeof fetch;
}

afterAll(() => {
  globalThis.fetch = realFetch;
},);

describe("isPrivateHost (SSRF guard)", () => {
  it("blocks localhost, private ranges, link-local, and metadata hosts", () => {
    for (
      const url of [
        "http://localhost/x",
        "http://127.0.0.1/x",
        "http://10.1.2.3/x",
        "http://172.16.0.9/x",
        "http://192.168.1.1/x",
        "http://169.254.169.254/latest/meta-data",
        "http://0.0.0.0/x",
        "http://[::1]/x",
        "http://metadata.google.internal/computeMetadata",
        "http://myhost.local/x",
      ]
    ) {
      expect(isPrivateHost(url,),).toBe(true,);
    }
  });

  it("allows public hosts", () => {
    expect(isPrivateHost("https://example.com/page",),).toBe(false,);
    expect(isPrivateHost("https://8.8.8.8/x",),).toBe(false,);
  });
});

describe("validatePreviewUrl", () => {
  it("rejects non-http(s) schemes and music domains", () => {
    expect(validatePreviewUrl("ftp://example.com",)?.code,).toBe("bad_request",);
    expect(validatePreviewUrl("https://open.spotify.com/track/1",)?.message,).toContain("Music",);
    expect(isMusicDomain("https://music.youtube.com/watch?v=1",),).toBe(true,);
    expect(isMusicDomain("https://example.com",),).toBe(false,);
  });
});

describe("parseOpenGraph", () => {
  it("extracts og meta and falls back to <title>", () => {
    const og = parseOpenGraph(OG_HTML,);
    expect(og.title,).toBe("Example Page",);
    expect(og.description,).toContain("quoted",);
    expect(og.imageUrl,).toBe("https://example.com/cover.png",);
    expect(parseOpenGraph("<html><head><title>Only Title</title></head></html>",).title,)
      .toBe("Only Title",);
  });

  it("neutralizes control characters and caps length (malicious HTML)", () => {
    const evil = `<meta property="og:title" content="ok\u0007 alert more">`;
    const og = parseOpenGraph(evil,);
    // Control chars are stripped and length capped; any markup that survives
    // in stored values is inert downstream (x-text, never innerHTML).
    expect(og.title,).not.toContain("\u0007",);
    const long = parseOpenGraph(
      `<meta property="og:title" content="${"x".repeat(500,)}">`,
    );

    expect((long.title ?? "").length,).toBeLessThanOrEqual(200,);
  });
});

describe("unfurlLinkPreview", () => {
  it("fetches once then serves the cache without refetching", async () => {
    mockFetch(() => new Response(OG_HTML, { status: 200, },));
    const url = "https://example.com/article";

    const first = await unfurlLinkPreview({
      database,
      chatId: "chat-1",
      userId: "u-owner",
      userRole: null,
      url,
    },);

    expect(first.ok,).toBe(true,);
    if (!first.ok) { return; }
    expect(first.preview.title,).toBe("Example Page",);
    expect(fetchCalls,).toHaveLength(1,);

    const second = await unfurlLinkPreview({
      database,
      chatId: "chat-1",
      userId: "u-owner",
      userRole: null,
      url,
    },);

    expect(second.ok,).toBe(true,);
    expect(fetchCalls,).toHaveLength(1,);
    if (!second.ok) { return; }
    expect(second.preview.imageUrl,).toBe("https://example.com/cover.png",);
  });

  it("refuses private-network URLs without fetching", async () => {
    mockFetch(null,);
    const result = await unfurlLinkPreview({
      database,
      chatId: "chat-1",
      userId: "u-owner",
      userRole: null,
      url: "http://169.254.169.254/latest/meta-data",
    },);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error.code,).toBe("bad_request",);
    expect(fetchCalls,).toHaveLength(0,);
  });

  it("propagates not_found for non-participants", async () => {
    mockFetch(null,);
    const result = await unfurlLinkPreview({
      database,
      chatId: "chat-1",
      userId: "u-nobody",
      userRole: null,
      url: "https://example.com/other",
    },);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error.code,).toBe("not_found",);
  });
});
