// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/server/terminal-ws.test.ts — gate-chain unit tests for the browser
// PTY terminal. The upgrade chain is exercised against a stub Bun.Server;
// no real sockets, no real PTY (open() is covered by the spawn-record
// builder + gate tests; a live-PTY test would hang CI without a TTY).

import { afterEach, describe, expect, test, } from "bun:test";

import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import type { Logger, } from "../logger";
import { createTerminalGateway, type TerminalSocketData, } from "./terminal-ws";
import {
  buildTerminalSpawnRecord,
  isTerminalUpgradeRequest,
  parseTerminalClientMessage,
} from "./terminal-ws-protocol";

interface StubServer {
  ip: string;
  upgraded: TerminalSocketData | null;
}

function makeStubServer(ip = "127.0.0.1",): StubServer & Bun.Server<TerminalSocketData> {
  // One mutable object: `upgrade` records into the same bag the test reads.
  const server: StubServer & Record<string, unknown> = { ip, upgraded: null, };
  server.requestIP = (): unknown => ({ address: ip, family: 4, port: 1234, });
  server.upgrade = (_request: Request, options: { data: TerminalSocketData },): boolean => {
    server.upgraded = options.data;
    return true;
  };

  return server as unknown as StubServer & Bun.Server<TerminalSocketData>;
}

const noopLogger = {
  child: (): typeof noopLogger => noopLogger,
  info: (): void => {},
  warn: (): void => {},
  error: (): void => {},
  debug: (): void => {},
} as unknown as Logger;

function makeConfig(overrides: { enabled?: boolean; allowRemote?: boolean } = {},): Config {
  return {
    web: {
      editor: "vscode",
      terminal: { enabled: overrides.enabled ?? true, allowRemote: overrides.allowRemote ?? false, },
    },
    auth: {},
  } as unknown as Config;
}

function makeGateway(
  config: Config,
  opts: {
    authContext?: { userId: string | null; userRole: string | null };
    authResponse?: Response;
    editor?: string | null;
    featureDetect?: boolean;
  } = {},
) {
  return createTerminalGateway({
    config,
    database: {} as Kysely<DB>,
    logger: noopLogger,
    rootDir: "/repo",
    featureDetect: () => opts.featureDetect ?? true,
    resolveEditor: () => opts.editor === undefined ? "/usr/bin/vim" : opts.editor,
    authenticateRequest: (() => {
      if (opts.authResponse) { return opts.authResponse; }

      return {
        context: {
          userId: opts.authContext?.userId ?? "u-admin",
          userRole: opts.authContext?.userRole ?? "admin",
          sessionId: null,
        },
      };
    }) as never,
  },);
}

function wsRequest(overrides: { url?: string; upgrade?: string | null; origin?: string | null } = {},): Request {
  const headers = new Headers({},);
  if (overrides.upgrade !== null) { headers.set("upgrade", overrides.upgrade ?? "websocket",); }
  if (overrides.origin) { headers.set("origin", overrides.origin,); }

  return new Request(overrides.url ?? "http://localhost:3000/api/v1/terminal?path=src/views/blog.html", {
    headers,
  },);
}

afterEach(() => {
  // Nothing global leaks; stubs are per-test.
},);

describe("parseTerminalClientMessage", () => {
  test("parses input and resize envelopes", () => {
    expect(parseTerminalClientMessage('{"type":"input","data":"ls\\n"}',),).toEqual({ type: "input", data: "ls\n", },);
    expect(parseTerminalClientMessage('{"type":"resize","cols":120,"rows":40}',),).toEqual(
      { type: "resize", cols: 120, rows: 40, },
    );
  });

  test("rejects malformed payloads", () => {
    expect(parseTerminalClientMessage("not json",),).toBe(null,);
    expect(parseTerminalClientMessage('{"type":"input","data":42}',),).toBe(null,);
    expect(parseTerminalClientMessage('{"type":"resize","cols":"x","rows":40}',),).toBe(null,);
    expect(parseTerminalClientMessage('{"type":"exit"}',),).toBe(null,);
    expect(parseTerminalClientMessage("null",),).toBe(null,);
  });
});

describe("buildTerminalSpawnRecord", () => {
  test("stamps a grep-friendly audit record with the file relative to the root", () => {
    const record = buildTerminalSpawnRecord({
      editor: "/usr/bin/vim",
      file: "/repo/src/views/blog.html",
      rootDir: "/repo",
      pid: 4242,
      userId: "u-admin",
    },);

    expect(record.taskType,).toBe("harness",);
    expect(record.pattern,).toBe("web-terminal",);
    expect(record.patternDetail,).toBe("file=src/views/blog.html",);
    expect(record.pid,).toBe(4242,);
    expect(record.result,).toBe("ok",);
    expect(record.msg,).toContain("u-admin",);
    expect(record.runId,).not.toBe("",);
  });
});

describe("isTerminalUpgradeRequest", () => {
  test("matches only the terminal route", () => {
    expect(isTerminalUpgradeRequest(new Request("http://x/api/v1/terminal",),),).toBe(true,);
    expect(isTerminalUpgradeRequest(new Request("http://x/api/v1/other",),),).toBe(false,);
    expect(isTerminalUpgradeRequest(new Request("http://x/api/v1/terminal/extra",),),).toBe(false,);
  });
});

describe("handleTerminalUpgrade gate chain", () => {
  test("426 when the request is not a websocket upgrade", async () => {
    const gateway = makeGateway(makeConfig({},),);
    const response = await gateway.handleTerminalUpgrade(wsRequest({ upgrade: null, },), makeStubServer(),);
    expect(response?.status,).toBe(426,);
  });

  test("404 when web.terminal.enabled is false (route hidden)", async () => {
    const gateway = makeGateway(makeConfig({ enabled: false, },),);
    const response = await gateway.handleTerminalUpgrade(wsRequest({},), makeStubServer(),);
    expect(response?.status,).toBe(404,);
  });

  test("501 when Bun.Terminal is unavailable", async () => {
    const gateway = makeGateway(makeConfig({},), { featureDetect: false, },);
    const response = await gateway.handleTerminalUpgrade(wsRequest({},), makeStubServer(),);
    expect(response?.status,).toBe(501,);
  });

  test("passes the auth failure response through (401)", async () => {
    const unauthorized = new Response("nope", { status: 401, },);
    const gateway = makeGateway(makeConfig({},), { authResponse: unauthorized, },);
    const response = await gateway.handleTerminalUpgrade(wsRequest({},), makeStubServer(),);
    expect(response,).toBe(unauthorized,);
  });

  test("403 for a non-admin role", async () => {
    const gateway = makeGateway(makeConfig({},), { authContext: { userId: "u-1", userRole: "user", }, },);
    const response = await gateway.handleTerminalUpgrade(wsRequest({},), makeStubServer(),);
    expect(response?.status,).toBe(403,);
  });

  test("403 for a non-loopback client unless allowRemote", async () => {
    const local = makeGateway(makeConfig({},),);
    expect((await local.handleTerminalUpgrade(wsRequest({},), makeStubServer("192.168.1.9",),))?.status,).toBe(403,);

    const remote = makeGateway(makeConfig({ allowRemote: true, },),);
    const server = makeStubServer("192.168.1.9",);
    expect(await remote.handleTerminalUpgrade(wsRequest({},), server,),).toBe(undefined,);
    expect(server.upgraded?.file,).toBe("/repo/src/views/blog.html",);
  });

  test("403 for a cross-origin upgrade unless allowRemote", async () => {
    const gateway = makeGateway(makeConfig({},),);
    const evil = wsRequest({ origin: "http://evil.example", },);
    expect((await gateway.handleTerminalUpgrade(evil, makeStubServer(),))?.status,).toBe(403,);

    const good = wsRequest({ origin: "http://localhost:3000", },);
    expect(await gateway.handleTerminalUpgrade(good, makeStubServer(),),).toBe(undefined,);
  });

  test("501 when no $EDITOR/$VISUAL resolves", async () => {
    const gateway = makeGateway(makeConfig({},), { editor: null, },);
    const response = await gateway.handleTerminalUpgrade(wsRequest({},), makeStubServer(),);
    expect(response?.status,).toBe(501,);
  });

  test("400 for a missing ?path", async () => {
    const gateway = makeGateway(makeConfig({},),);
    const response = await gateway.handleTerminalUpgrade(
      wsRequest({ url: "http://localhost:3000/api/v1/terminal", },),
      makeStubServer(),
    );

    expect(response?.status,).toBe(400,);
  });

  test("400 for a ?path that escapes the repo root", async () => {
    const gateway = makeGateway(makeConfig({},),);
    for (const path of ["../../etc/passwd", "/etc/passwd", "src/../../outside.txt",]) {
      const url = `http://localhost:3000/api/v1/terminal?path=${encodeURIComponent(path,)}`;
      const response = await gateway.handleTerminalUpgrade(wsRequest({ url, },), makeStubServer(),);
      expect(response?.status,).toBe(400,);
    }
  });

  test("upgrades a valid admin loopback request with clamped geometry", async () => {
    const gateway = makeGateway(makeConfig({},),);
    const server = makeStubServer();
    const url = "http://localhost:3000/api/v1/terminal?path=src/views/blog.html&cols=9999&rows=-3";
    const result = await gateway.handleTerminalUpgrade(wsRequest({ url, },), server,);
    expect(result,).toBe(undefined,);
    expect(server.upgraded?.userId,).toBe("u-admin",);
    expect(server.upgraded?.editor,).toBe("/usr/bin/vim",);
    expect(server.upgraded?.cols,).toBe(80,);
    expect(server.upgraded?.rows,).toBe(24,);
  });
});
