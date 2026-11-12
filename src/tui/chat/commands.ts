// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI slash-command completion.
 *
 * The server dispatches ~40 commands during message creation and serves the
 * live registry from `GET /api/v1/commands` (src/routes/commands/index.ts).
 * This module turns that registry into a status-bar hint plus a select/commit
 * state machine for the chat input box — no second screen, no engine import,
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

/**
 * The command name whose arguments are being typed — a `/`-prefixed input
 * with a name, a space, and something after it. `parseCommandQuery` treats
 * such input as settled (completion has nothing left to offer); the usage
 * hint takes over from there.
 * @param text - raw input box content
 * @returns the settled command name, or null when the input is not one
 */
export function parseSettledCommand(text: string,): string | null {
  if (!text.startsWith("/",)) { return null; }
  const space = text.indexOf(" ",);
  if (space <= 1) { return null; }
  return text.slice(1, space,);
}

/**
 * Guided-regen action vocabulary (src/assistant/commands/regen.ts). Static
 * on purpose — the TUI is a thin HTTP client and imports no engine code —
 * with parity against the backend pinned by chat/commands.test.ts.
 */
export const REGEN_ACTIONS = ["try-again", "add-details", "more-concise",] as const;

/**
 * The named-argument usage line for a command: the advertised valve specs
 * when the registry carries them, the guided-regen action vocabulary for
 * `/regen`.
 * @param descriptor - one registry row
 * @returns the usage line, or null when the command has none to show
 */
export function valveUsageLine(descriptor: CommandDescriptor,): string | null {
  const valves = descriptor.valves;
  if (valves !== undefined && valves.length > 0) {
    return valves
      .map((valve,) => {
        const type = valve.enum === undefined ? valve.type : valve.enum.join("|",);
        const note = valve.default === undefined ? "" : `, default ${String(valve.default,)}`;
        return `--${valve.name} (${type}${note})`;
      },)
      .join(", ",);
  }

  if (descriptor.name === "regen") {
    return `<${REGEN_ACTIONS.join("|",)}>`;
  }

  return null;
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
 *
 * Once the command name is settled (a space typed), the hint becomes the
 * command's named-argument usage line — the advertised valve vocabulary, or
 * `/regen`'s action ids — so styles and flags are discoverable while typing
 * arguments.
 */
export class CommandCompleter {
  private registry: CommandDescriptor[] = [];
  private matches: CommandDescriptor[] = [];
  private query: string | null = null;
  private index = -1;
  private settledCommand: CommandDescriptor | null = null;
  private loading = false;
  private settledFetch = false;
  /** Raw input box content, so the deferred registry load can re-settle. */
  private lastInput = "";
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
    this.lastInput = text;
    const query = parseCommandQuery(text,);
    if (query === null) {
      this.settle(text,);
      return;
    }

    this.settledCommand = null;
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
    if (this.settledCommand !== null) {
      const usage = valveUsageLine(this.settledCommand,);
      return usage === null ? null : `{bold}/${this.settledCommand.name}{/bold}  |  ${usage}`;
    }

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

    const single = this.matches.length === 1 ? this.matches[0] : undefined;
    const usage = single === undefined ? null : valveUsageLine(single,);
    const usagePart = usage === null ? "" : `  |  ${usage}`;

    return `${shown.join("  ",)}${overflow}${cursor}${usagePart}  |  Tab: cycle | Enter: accept`;
  }

  /** Drop every trace of the query — used when the input stops being a command. */
  private reset(): void {
    this.query = null;
    this.matches = [];
    this.index = -1;
    this.settledCommand = null;
    this.onChange();
  }

  /**
   * Resolve the usage hint for a settled command (name typed, arguments
   * being typed). Unknown names and commands without a usage line clear the
   * hint; an unchanged hint does not repaint.
   * @param text - raw input box content
   */
  private settle(text: string,): void {
    const name = parseSettledCommand(text,);
    // The lazy one-shot load must fire from this path too: a first keystroke
    // that lands directly on settled arguments still needs the registry.
    // Plain text (no command name) must not.
    if (name !== null) { this.request(); }
    const needle = name?.toLowerCase();
    const descriptor = needle === undefined
      ? undefined
      : this.registry.find((entry,) => entry.name.toLowerCase() === needle);

    const next = descriptor !== undefined && valveUsageLine(descriptor,) !== null ? descriptor : null;
    if (next === this.settledCommand && this.query === null && this.matches.length === 0) {
      return; // Nothing changed — plain text or the same settled command.
    }

    this.settledCommand = next;
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
    if (this.loading || this.settledFetch) { return; }
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
    this.settledFetch = true;
    if (result.ok) { this.registry = result.data; }
    // Repaint either way — skipping it on failure would strand the strip on
    // "…loading commands" for the rest of the session.
    this.refilter();
    // With the registry live, recompute the settled usage hint if that is
    // the state the user is sitting in.
    if (this.query === null) { this.settle(this.lastInput,); }
  }
}
