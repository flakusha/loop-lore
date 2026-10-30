// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/server/terminal-ws-protocol.ts — pure helpers of the browser PTY
// terminal (epic-browser-editor-support, approach B): route matching, the
// client message envelope, PTY-geometry clamps, loopback classification,
// error-response shaping, and the exec-log spawn record. Split from
// terminal-ws.ts so the gateway stays under the 250-line file budget.

import { relative, } from "node:path";

import type { HarnessRunRecord, } from "../harness/types";
import { safeJsonParse, safeJsonStringify, } from "../utils";

/** Route this gateway owns. */
export const TERMINAL_WS_PATH = "/api/v1/terminal";

/** Clamp bounds for the PTY geometry (defensive; clients send their own). */
export const MIN_COLS = 10;
export const MAX_COLS = 500;
export const MIN_ROWS = 4;
export const MAX_ROWS = 200;

/** Client → server message envelope (greenfield; JSON text frames). */
export type TerminalClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

/** Server → client non-byte frames (PTY bytes ride binary frames). */
export interface TerminalServerFrame {
  type: "exit" | "error";
  code?: number;
  message?: string;
}

/**
 * Parse one client envelope.
 * @param raw - the raw text frame.
 * @returns the typed message, or null when malformed.
 */
export function parseTerminalClientMessage(raw: string,): TerminalClientMessage | null {
  const result = safeJsonParse<unknown>(raw,);
  if (!result.ok) { return null; }

  const parsed = result.value;
  if (typeof parsed !== "object" || parsed === null) { return null; }

  const msg = parsed as Record<string, unknown>;
  if (msg.type === "input" && typeof msg.data === "string") {
    return { type: "input", data: msg.data, };
  }

  if (
    msg.type === "resize" && typeof msg.cols === "number" && Number.isInteger(msg.cols,) &&
    typeof msg.rows === "number" && Number.isInteger(msg.rows,)
  ) {
    return { type: "resize", cols: msg.cols, rows: msg.rows, };
  }

  return null;
}

/**
 * Encode one server control frame. These frames are two-field literals, so a
 * stringify failure is impossible in practice — the fallback keeps the wire
 * protocol total anyway.
 * @param frame - the exit/error frame.
 * @returns the JSON text to send.
 */
export function terminalFrameText(frame: TerminalServerFrame,): string {
  const encoded = safeJsonStringify(frame,);
  return encoded.ok ? encoded.value : '{"type":"error","message":"frame encode failed"}';
}

/**
 * The exec-log record for one PTY spawn
 * (TASK-web-editor-pty-spawn-audit-logging-to-harness-exec-log).
 * @param opts - editor binary, file, pid, and the acting user.
 * @returns a complete run record (appendExecLog never throws).
 */
export function buildTerminalSpawnRecord(opts: {
  editor: string;
  file: string;
  rootDir: string;
  pid: number | null;
  userId: string | null;
},): HarnessRunRecord {
  return {
    runId: crypto.randomUUID(),
    ts: new Date().toISOString(),
    runMs: 0,
    task: "terminal-editor",
    taskType: "harness",
    model: opts.editor,
    tools: [],
    toolCount: 0,
    pattern: "web-terminal",
    patternDetail: `file=${relative(opts.rootDir, opts.file,)}`,
    result: "ok",
    error: null,
    toolingGap: null,
    costUsd: null,
    tokensIn: 0,
    tokensOut: 0,
    branch: null,
    pid: opts.pid,
    gitSha: null,
    msg: `web-terminal PTY spawn by ${opts.userId ?? "anonymous"}`,
    turnId: null,
  };
}

/**
 * True when the request targets this gateway's route.
 * @param request - incoming request.
 */
export function isTerminalUpgradeRequest(request: Request,): boolean {
  return new URL(request.url,).pathname === TERMINAL_WS_PATH;
}

/**
 * Plain-text error response for gate rejections (the WS handshake has no JSON
 * body parser; these are operator-facing strings, not API envelopes).
 * @param status - HTTP status.
 * @param message - human-readable reason.
 */
export function textResponse(status: number, message: string,): Response {
  return new Response(message, { status, headers: { "Content-Type": "text/plain", }, },);
}

/**
 * True for loopback client addresses and localhost origins.
 * @param host - an IP address or hostname (no scheme/port).
 */
export function isLocalhostHost(host: string,): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "",);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "0.0.0.0";
}

/**
 * Clamp a PTY dimension to its sane range, falling back when out of bounds.
 * @param value - the raw value (NaN-safe: non-integers fall back).
 * @param min - inclusive lower bound.
 * @param max - inclusive upper bound.
 * @param fallback - value used when `value` fails the range check.
 */
export function clampDimension(value: number, min: number, max: number, fallback: number,): number {
  return Number.isInteger(value,) && value >= min && value <= max ? value : fallback;
}
