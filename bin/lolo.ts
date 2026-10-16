#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * bin/lolo.ts — CLI entry point for the Loop Lore TUI.
 *
 * Launches the terminal UI via {@link createTUIApp}.
 *
 * Usage: bun run bin/lolo.ts    (or `bun run lolo` after bin field is installed)
 *
 * Environment:
 *   LOOP_LORE_API_BASE_URL  Base URL of the Loop Lore API server.
 *                           Defaults to http://localhost:3000.
 *
 * Shortcuts:
 *   F2          Toggle asset sidebar
 *   F3          Toggle harness panel
 *   F5          Reload / re-render the TUI
 *   Ctrl+L      Clear the screen
 *   Esc / q     Quit
 */

import { createTUIApp, } from "../src/tui/app";

const HELP_TEXT = `lolo — Loop Lore TUI launcher

Usage: lolo [options]

Options:
  -h, --help    Show this help text and exit

Shortcuts:
  F2            Toggle asset sidebar
  F3            Toggle harness panel
  F5            Reload / re-render
  Ctrl+L        Clear screen
  Esc / q       Quit

Environment:
  LOOP_LORE_API_BASE_URL   API base URL (default: http://localhost:3000)
`;

interface CliOptions {
  readonly help: boolean;
}

/**
 * Parse and validate CLI arguments.
 * @returns Parsed options object.
 */
function parseCliArgs(): CliOptions {
  const args = Bun.argv.slice(2,);
  const help = args.includes("--help",) || args.includes("-h",);
  return { help, };
}

/**
 * Print help text to stdout and exit successfully.
 * @throws Never returns (calls process.exit).
 */
function printHelp(): never {
  process.stdout.write(HELP_TEXT,);
  process.exit(0,);
}

/**
 * Boot the TUI. Calls {@link createTUIApp} which initialises the logger and
 * constructs the full screen manager.
 * @throws {Error} If TUI initialisation fails.
 */
function main(): void {
  const opts = parseCliArgs();
  if (opts.help) {
    printHelp();
  }
  // The TUI self-starts inside createTUIApp — this function's role is purely
  // to guard the entry point and route CLI arguments.

  createTUIApp();
}

// Entry-point guard — this module is inert on import. Only starts the TUI
// when executed directly (bun run bin/lolo.ts or the installed bin/lolo CLI).
if (import.meta.main) {
  main();
}
