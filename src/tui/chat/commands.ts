// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI slash-command completion.
 *
 * The server dispatches ~40 commands during message creation and serves the
 * live registry from `GET /api/v1/commands` (src/routes/commands/index.ts).
 * This module turns that registry into a status-bar hint plus a select/commit
 * state machine for the chat input box — no second screen, no blessed import,
 * so every branch is testable without a terminal.
 *
 * The registry is fetched lazily on the first `/` the user types, not at boot:
 * a TUI that never sends a command must not pay for the request.
 */
import { getChildLogger, } from "../../logger";
import type { CommandDescriptor, CommandListResult, } from "./api";

export type { CommandDescriptor, } from "./api";

/** Matches rendered in the hint before the overflow counter takes over. */
const MAX_MATCHES = 6;

/** Trailing space so a committed command is ready for its arguments. */
const COMMAND_SUFFIX = " ";

/**
 * The `/`-prefixed token being typed, or null when the input is not a command.
 * A space ends the query: once arguments are being typed the command is
 * settled and completion has nothing left to offer.
 * @param text - raw input box content
 * @returns the token after the slash, or null when the input is not a command
 */
export function parseCommandQuery(text: string,): string | null {
  if (!text.startsWith("/",)) { return null; }
  const token = text.slice(1,);
  if (token.includes(" ",)) { return null; }
  return token;
}

/**
 * Case-insensitive prefix filter over the registry, order preserved.
 * An empty query (a bare `/`) matches everything.
 * @param registry - the live command registry
 * @param query - the token typed after the slash
 * @returns the matching commands, in registry order
 */
export function matchCommands(
  registry: CommandDescriptor[],
  query: string,
): CommandDescriptor[] {
  const needle = query.toLowerCase();
  return registry.filter((entry,) => entry.name.toLowerCase().startsWith(needle,));
}

/** Construction options for {@link CommandCompleter}. */
export interface CommandCompleterOptions {
  /** Loads the live registry. Called at most once, on the first `/`. */
  loadRegistry: () => Promise<CommandListResult>;
  /** Invoked after every state change so the owner can repaint. */
  onChange: () => void;
}

/**
 * Completion state machine for the chat input box.
 *
 * Selection starts unselected on purpose: a bare `/` followed by Enter must
 * still send as an ordinary message, exactly as it does without completions.
 * Tab moves the selection; Enter on a selection commits the command text and
 * leaves the send to the following Enter.
 */
export class CommandCompleter {
  private registry: CommandDescriptor[] = [];
  private matches: CommandDescriptor[] = [];
  private query: string | null = null;
  private index = -1;
  private loading = false;
  private settled = false;
  private readonly loadRegistry: () => Promise<CommandListResult>;
  private readonly onChange: () => void;

  /**
   * @param options - the registry loader and the repaint callback
   */
  constructor(options: CommandCompleterOptions,) {
    this.loadRegistry = options.loadRegistry;
    this.onChange = options.onChange;
  }

  /**
   * Re-filter against the current input box content. Starts the lazy load on
   * the first command query and ignores every keystroke that is not one.
   * @param text - raw input box content
   */
  update(text: string,): void {
    const query = parseCommandQuery(text,);
    if (query === null) {
      this.reset();
      return;
    }

    this.query = query;
    this.request();
    this.refilter();
  }

  /**
   * Advance the selection, wrapping at the end.
   * @returns whether anything was selectable — false leaves Tab to the caller
   */
  cycle(): boolean {
    if (this.matches.length === 0) { return false; }
    this.index = this.index + 1 >= this.matches.length ? 0 : this.index + 1;
    this.onChange();
    return true;
  }

  /**
   * Commit the selected command to the input box.
   * @returns the command text to write, or null when nothing is selected
   */
  accept(): string | null {
    const chosen = this.matches[this.index];
    if (!chosen) { return null; }
    const committed = `/${chosen.name}${COMMAND_SUFFIX}`;
    this.reset();
    this.onChange();
    return committed;
  }

  /** @returns the currently highlighted command, or null when unselected */
  selected(): CommandDescriptor | null {
    return this.matches[this.index] ?? null;
  }

  /** @returns the status-bar hint, or null when the input is not a command */
  hint(): string | null {
    if (this.query === null) { return null; }

    if (this.matches.length === 0) {
      return this.loading ? "/ …loading commands" : `/ no command matches "${this.query}"`;
    }

    const shown = this.matches
      .slice(0, MAX_MATCHES,)
      .map((entry, position,) => position === this.index ? `{bold}/${entry.name}{/bold}` : `/${entry.name}`);

    const overflow = this.matches.length > MAX_MATCHES
      ? ` +${this.matches.length - MAX_MATCHES} more`
      : "";

    const cursor = this.index >= 0 ? ` [${this.index + 1}/${this.matches.length}]` : "";

    return `${shown.join("  ",)}${overflow}${cursor}  |  Tab: cycle | Enter: accept`;
  }

  /** Drop every trace of the query — used when the input stops being a command. */
  private reset(): void {
    this.query = null;
    this.matches = [];
    this.index = -1;
    this.onChange();
  }

  /** Recompute matches from the cached registry and repaint. */
  private refilter(): void {
    this.matches = this.query === null ? [] : matchCommands(this.registry, this.query,);
    this.index = -1;
    this.onChange();
  }

  /** Kick the one-shot registry fetch. */
  private request(): void {
    if (this.loading || this.settled) { return; }
    this.loading = true;
    // Fire-and-forget still needs a catch: an unhandled rejection kills the process.
    void this.load()
      .catch((error: unknown,) => {
        getChildLogger("tui",)?.warn("tui: command registry load failed", {
          error: error instanceof Error ? error.message : String(error,),
        },);
      },);
  }

  /** Fetch once, then re-filter against whatever the user has typed since. */
  private async load(): Promise<void> {
    const result = await this.loadRegistry();
    this.loading = false;
    // Settled either way: a failed registry must not retry on every keystroke.
    this.settled = true;
    if (!result.ok) { return; }
    this.registry = result.data;
    this.refilter();
  }
}
