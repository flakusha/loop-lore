// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/server/terminal-ws.ts — approach B: browser PTY terminal gateway
// (epic-browser-editor-support). Native Bun.serve websocket handler +
// server.upgrade — an Elysia .ws() route cannot upgrade under the
// Bun.serve({ fetch }) server shape in start.ts. Pure wire/audit helpers
// live in ./terminal-ws-protocol.

import { resolve, } from "node:path";

import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { appendExecLog, } from "../harness/exec-log";
import type { Logger, } from "../logger";
import { authenticate, } from "../middleware/auth/authenticate";
import { requirePermission, } from "../middleware/permissions";
import type { RequestContext, } from "../middleware/types";
import { isWithin, } from "../utils/is-within";
import {
  buildTerminalSpawnRecord,
  clampDimension,
  isLocalhostHost,
  MAX_COLS,
  MAX_ROWS,
  MIN_COLS,
  MIN_ROWS,
  parseTerminalClientMessage,
  terminalFrameText,
  type TerminalServerFrame,
  textResponse,
} from "./terminal-ws-protocol";

/** Idle ceiling: a PTY nobody types into for this long is killed. */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Live per-socket session state, owned by the socket's data bag. */
interface TerminalSession {
  terminal: Bun.Terminal | null;
  proc: Bun.Subprocess | null;
  idleTimer: Timer | null;
  closed: boolean;
}

/** Data attached at upgrade; mutated with the live session in open(). */
export interface TerminalSocketData {
  userId: string | null;
  /** Absolute, containment-checked file the $EDITOR opens. */
  file: string;
  editor: string;
  cols: number;
  rows: number;
  session: TerminalSession;
}

/** Injectable seams so the gate chain is unit-testable without a server. */
export interface TerminalGatewayDeps {
  config: Config;
  database: Kysely<DB>;
  logger: Logger;
  /** Absolute repo root: PTY cwd and the containment root for `path`. */
  rootDir: string;
  /** Override the runtime feature-detect (tests inject false). */
  featureDetect?: () => boolean;
  /** Override $EDITOR/$VISUAL resolution (tests inject null). */
  resolveEditor?: () => string | null;
  /** Override session resolution (tests inject a synthetic context). */
  authenticateRequest?: typeof authenticate;
}

/**
 * Create the websocket handler + upgrade gate. The handler is passed to
 * Bun.serve({ websocket }); the gate is called from fetch BEFORE the request
 * reaches the normal pipeline.
 * @param deps - config snapshot, database, logger, repo root + test seams.
 */
export function createTerminalGateway(deps: TerminalGatewayDeps,): {
  websocket: Bun.WebSocketHandler<TerminalSocketData>;
  handleTerminalUpgrade: (request: Request, server: Bun.Server<TerminalSocketData>,) => Promise<Response | undefined>;
} {
  const log = deps.logger.child({ module: "terminal-ws", },);
  const featureDetect = deps.featureDetect ?? ((): boolean => typeof Bun.Terminal === "function");
  const resolveEditor = deps.resolveEditor ?? ((): string | null => process.env.VISUAL ?? process.env.EDITOR ?? null);
  const authenticateRequest = deps.authenticateRequest ?? authenticate;

  const killSession = (ws: Bun.ServerWebSocket<TerminalSocketData>,): void => {
    const { session, } = ws.data;
    if (session.closed) { return; }

    session.closed = true;
    if (session.idleTimer) { clearTimeout(session.idleTimer,); }

    try {
      session.proc?.kill();
    } catch {
      // Already exited — nothing to signal.
    }

    try {
      session.terminal?.close();
    } catch {
      // Already closed.
    }
  };

  const touchIdle = (ws: Bun.ServerWebSocket<TerminalSocketData>,): void => {
    const { session, } = ws.data;
    if (session.idleTimer) { clearTimeout(session.idleTimer,); }

    session.idleTimer = setTimeout(() => {
      log.warn("terminal PTY idle-timeout — killing", { file: ws.data.file, userId: ws.data.userId, },);
      killSession(ws,);
      ws.close();
    }, IDLE_TIMEOUT_MS,);
  };

  return {
    websocket: {
      // Type marker for Bun's ws.data (documented pattern; runtime-unused).
      data: undefined as unknown as TerminalSocketData,
      // Bun's own socket-idle ceiling (seconds; max 960). An editor session
      // can legitimately sit silent for minutes, so push it to the max — the
      // app-level IDLE_TIMEOUT_MS above is the real kill switch.
      idleTimeout: 960,
      open(ws,) {
        const { editor, file, userId, cols, rows, } = ws.data;
        const terminal = new Bun.Terminal({
          cols,
          rows,
          data: (_terminal, bytes,) => {
            // ServerWebSocket readyState is MDN-style: 1 = OPEN.
            try {
              if (ws.readyState === 1) { ws.send(bytes,); }
            } catch {
              // Socket died mid-send; killSession follows via close().
            }
          },
          exit: (_terminal, code,) => {
            if (code !== 0) { log.warn("terminal PTY stream closed with error", { code, file, },); }
          },
        },);

        const proc = Bun.spawn([editor, file,], { terminal, cwd: deps.rootDir, },);
        ws.data.session = { terminal, proc, idleTimer: null, closed: false, };
        appendExecLog(
          buildTerminalSpawnRecord({ editor, file, rootDir: deps.rootDir, pid: proc.pid ?? null, userId, },),
        );

        log.info("terminal PTY spawned", { editor, file, pid: proc.pid, userId, },);
        touchIdle(ws,);

        void proc.exited.then((code,) => {
          if (!ws.data.session.closed) {
            const frame: TerminalServerFrame = { type: "exit", code, };
            ws.send(terminalFrameText(frame,),);
            killSession(ws,);
            ws.close();
          }
        },).catch((error: unknown,) => {
          log.error("terminal proc.exited rejected", error instanceof Error ? error : new Error(String(error,),), {
            file,
          },);

          killSession(ws,);
          ws.close();
        },);
      },
      message(ws, message,) {
        if (typeof message !== "string") {
          const frame: TerminalServerFrame = { type: "error", message: "binary frames are not accepted", };
          ws.send(terminalFrameText(frame,),);
          return;
        }

        const parsed = parseTerminalClientMessage(message,);
        const { session, } = ws.data;
        if (parsed === null || session.closed) {
          log.warn("terminal received invalid message", { userId: ws.data.userId, },);
          return;
        }

        touchIdle(ws,);
        if (parsed.type === "input") {
          session.terminal?.write(parsed.data,);
          return;
        }

        const cols = clampDimension(parsed.cols, MIN_COLS, MAX_COLS, 80,);
        const rows = clampDimension(parsed.rows, MIN_ROWS, MAX_ROWS, 24,);
        try {
          session.terminal?.resize(cols, rows,);
        } catch {
          // Resizing a dead PTY is a no-op for the session; exit is imminent.
        }
      },
      close(ws,) {
        killSession(ws,);
      },
    },
    async handleTerminalUpgrade(request, server,) {
      const upgradeHeader = request.headers.get("upgrade",)?.toLowerCase();
      if (upgradeHeader !== "websocket") {
        return textResponse(426, "WebSocket upgrade required",);
      }

      if (!deps.config.web.terminal.enabled) {
        // Feature off: indistinguishable from a missing route.
        return textResponse(404, "Not Found",);
      }

      if (!featureDetect()) {
        return textResponse(501, "Bun.Terminal is unavailable in this runtime — upgrade Bun to >=1.4.0",);
      }

      const authResult = await authenticateRequest({
        request,
        database: deps.database,
        authConfig: deps.config.auth,
      },);

      if (authResult instanceof Response) { return authResult; }

      const { userId, userRole, } = authResult.context as RequestContext;
      const permissionGate = requirePermission("admin.system",);
      const denial = await permissionGate({ request, userId, userRole, },);
      if (denial) { return denial; }

      const allowRemote = deps.config.web.terminal.allowRemote;
      const clientIp = server.requestIP(request,);
      if (!allowRemote && (!clientIp || !isLocalhostHost(clientIp.address,))) {
        return textResponse(403, "Terminal is localhost-only (web.terminal.allowRemote)",);
      }

      const origin = request.headers.get("origin",);
      if (!allowRemote && origin !== null) {
        let originHost = "";
        try {
          originHost = new URL(origin,).hostname;
        } catch {
          originHost = "invalid";
        }

        if (!isLocalhostHost(originHost,)) {
          return textResponse(403, "Cross-origin terminal upgrades are rejected",);
        }
      }

      const editor = resolveEditor();
      if (!editor) {
        return textResponse(501, "No $EDITOR/$VISUAL configured on the server",);
      }

      const url = new URL(request.url,);
      const requestedPath = url.searchParams.get("path",);
      if (!requestedPath) {
        return textResponse(400, "Missing ?path=<repo-relative file>",);
      }

      const file = resolve(deps.rootDir, requestedPath,);
      if (!isWithin(deps.rootDir, file,)) {
        return textResponse(400, "Path escapes the repository root",);
      }

      const cols = clampDimension(Number.parseInt(url.searchParams.get("cols",) ?? "", 10,), MIN_COLS, MAX_COLS, 80,);
      const rows = clampDimension(Number.parseInt(url.searchParams.get("rows",) ?? "", 10,), MIN_ROWS, MAX_ROWS, 24,);
      const upgraded = server.upgrade(request, {
        data: {
          userId,
          file,
          editor,
          cols,
          rows,
          session: { terminal: null, proc: null, idleTimer: null, closed: false, },
        },
      },);

      return upgraded ? undefined : textResponse(400, "WebSocket upgrade failed",);
    },
  };
}
