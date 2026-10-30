// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Terminal Panel — Alpine data factory (epic-browser-editor-support, approach B).
 *
 * Full PTY editor overlay: lazily loads the xterm chunk at runtime
 * (dist/public/terminal-xterm.js via dynamic URL import — the main bundle
 * stays lean because bun builds it as one non-split IIFE), talks to
 * WS /api/v1/terminal, and — when the server bootstrap says
 * web.terminal.enabled — intercepts approach-A `a[data-editor-path]` clicks
 * so "Open in $EDITOR" upgrades to the in-browser PTY.
 */

import type { FitAddon, } from "@xterm/addon-fit";
import type { Terminal, } from "@xterm/xterm";
import { safeJsonParse, safeJsonStringify, } from "../utils";

export interface TerminalPanelState {
  open: boolean;
  filePath: string | null;
  status: string;
  openFile(path: string,): void;
  closePanel(): void;
}

interface LiveSession {
  terminal: Terminal;
  fit: FitAddon;
  socket: WebSocket;
  observer: ResizeObserver;
}

interface XtermFactoryHandle {
  terminal: Terminal;
  fit: FitAddon;
}

type CreateTerminalFn = (opts: { parent: HTMLElement; fontSize?: number; background?: string },) => XtermFactoryHandle;

let session: LiveSession | null = null;

/**
 * Encode one client envelope; a stringify failure is impossible for these
 * literals, but the fallback keeps the wire protocol total.
 * @param message - input or resize envelope.
 * @returns the JSON text frame.
 */
function envelopeText(
  message: { type: "input"; data: string } | { type: "resize"; cols: number; rows: number },
): string {
  const encoded = safeJsonStringify(message,);
  return encoded.ok ? encoded.value : '{"type":"error","message":"encode failed"}';
}

/**
 * Load the xterm chunk. Non-literal specifier on purpose: the bundler must
 * leave this as a runtime import instead of inlining the chunk.
 * @returns the chunk's createTerminal factory.
 */
async function loadXterm(): Promise<CreateTerminalFn> {
  // Assembled at runtime so the bundler cannot resolve (and inline) the
  // chunk — bun folds plain string literals even through a const.
  const chunkUrl = ["/terminal-xterm", ".js",].join("",);
  const mod = (await import(chunkUrl)) as { createTerminal: CreateTerminalFn };
  return mod.createTerminal;
}

/**
 * Close and dispose the live PTY session (idempotent).
 */
function disposeSession(): void {
  if (!session) { return; }

  const { terminal, socket, observer, } = session;
  session = null;
  observer.disconnect();
  try {
    socket.close();
  } catch {
    // Already closing — the close handler is gone with the session.
  }

  terminal.dispose();
}

/**
 * Wire one websocket to a fresh xterm instance inside `body`.
 * @param state - Alpine panel state (status mutations for UX feedback).
 * @param path - repo-relative file the server $EDITOR opens.
 */
async function connectSession(state: TerminalPanelState, path: string,): Promise<void> {
  const body = document.querySelector<HTMLElement>("#terminal-panel-body",);
  if (!body) { return; }

  const createTerminal = await loadXterm();
  const { terminal, fit, } = createTerminal({ parent: body, },);

  const proto = globalThis.location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${globalThis.location.host}/api/v1/terminal` +
    `?path=${encodeURIComponent(path,)}&cols=${terminal.cols}&rows=${terminal.rows}`;

  const socket = new WebSocket(url,);
  socket.binaryType = "arraybuffer";

  const sendEnvelope = (payload: string,): void => {
    if (socket.readyState === WebSocket.OPEN) { socket.send(payload,); }
  };

  const observer = new ResizeObserver(() => {
    fit.fit();
    sendEnvelope(envelopeText({ type: "resize", cols: terminal.cols, rows: terminal.rows, },),);
  },);

  observer.observe(body,);

  session = { terminal, fit, socket, observer, };
  state.status = "";

  terminal.onData((data,) => {
    sendEnvelope(envelopeText({ type: "input", data, },),);
  },);

  socket.onmessage = (event: MessageEvent,) => {
    if (!session) { return; }

    if (event.data instanceof ArrayBuffer) {
      terminal.write(new Uint8Array(event.data,),);
      return;
    }

    // JSON control frames: exit | error.
    const parsedFrame = safeJsonParse<{ type?: string; code?: number; message?: string }>(String(event.data,),);
    if (parsedFrame.ok) {
      const frame = parsedFrame.value;
      if (frame.type === "exit") {
        state.status = `exited (${frame.code ?? "?"})`;
      } else if (frame.type === "error") {
        state.status = frame.message ?? "error";
      }
    } else {
      // Stray text frame — render it; PTYs occasionally emit plain lines.
      terminal.write(String(event.data,),);
    }
  };

  socket.onclose = () => {
    if (session?.socket === socket) {
      state.status ||= "connection closed";
    }
  };

  terminal.focus();
}

/**
 * Alpine x-data factory for the #terminal-panel host in layout.html.
 * @returns panel state with imperative open/close.
 */
export function terminalPanel(): TerminalPanelState {
  return {
    open: false,
    filePath: null,
    status: "",
    openFile(path: string,) {
      this.filePath = path;
      this.open = true;
      this.status = "connecting…";
      disposeSession();
      void connectSession(this, path,).catch((error: unknown,) => {
        this.status = error instanceof Error ? error.message : "failed to open terminal";
      },);
    },
    closePanel() {
      this.open = false;
      disposeSession();
    },
  };
}

/**
 * Open the terminal panel for a repo-relative file from anywhere
 * (used by the approach-A anchor interception below).
 * @param path - repo-relative file path.
 */
export function openWebTerminal(path: string,): void {
  const host = document.querySelector<HTMLElement>("#terminal-panel",);
  if (!host || typeof Alpine === "undefined") { return; }

  const state = Alpine.$data(host,) as unknown as TerminalPanelState | undefined;
  state?.openFile(path,);
}

/** Click facts the interception decision needs (subset of MouseEvent). */
export interface ClickLike {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

/**
 * Decide whether a click upgrades an approach-A anchor to the PTY panel.
 * @param enabled - web.terminal.enabled bootstrap flag.
 * @param click - the click event facts.
 * @returns the anchor's data-editor-path when the panel should take over, or
 *   null when the default editor:// navigation should run.
 */
export function anchorInterceptPath(enabled: boolean, click: ClickLike,): string | null {
  if (!enabled) { return null; }

  if (
    click.defaultPrevented || click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey
  ) {
    return null;
  }

  const target = click.target as Element | null;
  if (!target || typeof target.closest !== "function") { return null; }

  const anchor = target.closest("a[data-editor-path]",) as HTMLAnchorElement | null;
  if (!anchor) { return null; }

  return anchor.getAttribute("data-editor-path",);
}

type TerminalPanelFactory = typeof terminalPanel;
type OpenWebTerminal = typeof openWebTerminal;
declare global {
  var terminalPanel: TerminalPanelFactory;

  var openWebTerminal: OpenWebTerminal;
}

(globalThis as unknown as { terminalPanel: TerminalPanelFactory }).terminalPanel = terminalPanel;
(globalThis as unknown as { openWebTerminal: OpenWebTerminal }).openWebTerminal = openWebTerminal;

// ── Approach-A anchor upgrade ────────────────────────────────────────────────
// One capture-phase document listener (registered when this module loads as
// part of the deferred alpine-init bundle); survives htmx swaps. Capture phase
// beats the anchor's own navigation. Guarded so importing the module in a
// non-DOM context (unit tests) stays side-effect free.
if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (event,) => {
      const path = anchorInterceptPath(
        Boolean((globalThis as { __WEB_TERMINAL_ENABLED__?: boolean }).__WEB_TERMINAL_ENABLED__,),
        event as unknown as ClickLike,
      );

      if (path === null || path === "") { return; }

      event.preventDefault();
      openWebTerminal(path,);
    },
    true,
  );
}
