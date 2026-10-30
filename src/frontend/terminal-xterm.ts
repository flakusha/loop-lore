// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * xterm chunk factory (epic-browser-editor-support, approach B).
 *
 * This module is built as its own unhashed ESM chunk
 * (dist/public/terminal-xterm.js) and loaded at runtime via dynamic
 * `import("/terminal-xterm.js")` from terminal-panel.ts — the ~300KB
 * terminal stack stays out of the main alpine-init bundle, which bun
 * builds as a single non-split IIFE.
 */

import { FitAddon, } from "@xterm/addon-fit";
import { Terminal, } from "@xterm/xterm";

export interface XtermHandle {
  terminal: Terminal;
  fit: FitAddon;
}

/**
 * Create an xterm instance opened (and fitted) inside `parent`.
 * @param opts - parent element + optional font size.
 * @returns the terminal and its fit addon.
 */
export function createTerminal(opts: { parent: HTMLElement; fontSize?: number; background?: string },): XtermHandle {
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: opts.fontSize ?? 13,
    theme: { background: opts.background ?? "#1b1b1f", },
  },);

  const fit = new FitAddon();
  terminal.loadAddon(fit,);
  terminal.open(opts.parent,);
  fit.fit();
  return { terminal, fit, };
}
