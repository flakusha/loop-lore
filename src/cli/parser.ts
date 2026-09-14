// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared CLI parser module wrapping `@optique/run` for scripts and tools.
 *
 * Every CLI entry point in `src/` that reads argv should import `runScript`
 * (or the re-exported combinators below) instead of hand‑walking `Bun.argv` /
 * `process.argv`. The wrapper:
 *
 *   - Reads `process.argv.slice(2)` by default (override with `args`).
 *   - Renders `--help` / `--version` via Optique's built‑in pipeline.
 *   - Exits with the project's `errorExitCode` (default 1) on parse error.
 *   - Returns the typed result; callers narrow with TypeScript inference.
 *
 * See `.plan/epics/epic-cli-tooling-optique.md` for the migration plan.
 */

import { message, } from "@optique/core/message";
import type { InferValue, Mode, Parser, } from "@optique/core/parser";
import { run, } from "@optique/run";
import type { RunOptions, } from "@optique/run";

/**
 * Shared `run()` options for every script CLI in the repo. Defaults line up
 * with our house style: minimal but discoverable help, no colors when stdout
 * is not a TTY (handled by Optique automatically).
 */
export interface ScriptRunOptions {
  /** Program name in usage/help. Defaults to `process.argv[1]` basename. */
  readonly programName?: string;
  /** One‑line brief shown at the top of `--help` output. */
  readonly brief?: string;
  /** Detailed description shown after the usage line. */
  readonly description?: string;
  /** Usage examples appended to `--help`. */
  readonly examples?: string;
  /** Version string — enables `--version` / `version` subcommand. */
  readonly version?: string;
  /** Enable `--help` (`"option"`), `help` subcommand (`"command"`), or both. */
  readonly help?: "command" | "option" | "both";
  /** Enable shell completion (`completion` subcommand + `--completion`). */
  readonly completion?: "command" | "option" | "both";
  /** Show default values in `--help` (`[value]` form). */
  readonly showDefault?: boolean;
  /** Exit code on parse error. Defaults to 1. */
  readonly errorExitCode?: number;
  /** Explicit argv override (defaults to `process.argv.slice(2)`). */
  readonly args?: readonly string[];
}

/**
 * Run a parser against argv, printing help/version automatically.
 *
 * The parser's inferred value type is returned. On `--help`/`--version` the
 * process exits via Optique's `onExit` (defaults to `process.exit`).
 *
 * @typeParam T - Parser type carrying its own `Mode` and inferred value.
 * @param parser - Combinatorial parser describing the CLI.
 * @param options - Run-time options (program name, brief, version, ...).
 * @returns The parsed, typed value.
 */
export function runScript<
  T extends Parser<Mode, unknown, unknown>,
>(parser: T, options: ScriptRunOptions = {},): InferValue<T> {
  const runOptions: RunOptions = {
    programName: options.programName,
    args: options.args,
    brief: options.brief === undefined ? undefined : message`${options.brief}`,
    description: options.description === undefined
      ? undefined
      : message`${options.description}`,
    examples: options.examples === undefined
      ? undefined
      : message`${options.examples}`,
    version: options.version,
    help: options.help,
    completion: options.completion,
    showDefault: options.showDefault,
    errorExitCode: options.errorExitCode,
  };
  return run(parser, runOptions,) as InferValue<T>;
}

// Re-export the most-used Optique symbols so callers import from one place.
// Combinators live under `@optique/core/constructs`; primitives under
// `@optique/core/primitives`; value parsers under `@optique/core/valueparser`.
// Re-export the Optique symbols actually used by call-sites in this repo.
// Add symbols here only when a migration script needs them.
export {
  flag,
  object,
  option,
  optional,
  withDefault,
} from "@optique/core";
export type { InferValue, Mode, Parser, } from "@optique/core/parser";
export { choice, integer, string, } from "@optique/core/valueparser";
