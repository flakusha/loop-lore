// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/chat/commands.ts — the slash-command completion state machine.
 *
 * No `mock.module` here: neither commands.ts nor the loader path it reaches
 * stubs a module at import time, so the suite behaves identically with or
 * without `--isolate` and needs no ISOLATED gate. That is the same convention
 * the sibling tui/chat/api.test.ts uses; app.test.ts gates because it does
 * stub modules, this one does not.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { listMessageActions, } from "../../assistant/commands/regen";
import { safeFetch as realFetch, } from "../../utils";
import type { FetchResult, } from "../../utils/safe-fetch/types";
import type { CommandDescriptor, CommandListResult, } from "./api";
import { loadCommands, setFetch, } from "./api";
import {
  CommandCompleter,
  matchCommands,
  parseCommandQuery,
  parseSettledCommand,
  REGEN_ACTIONS,
  valveUsageLine,
} from "./commands";

const REGISTRY: CommandDescriptor[] = [
  { name: "reset", descriptionKey: "commands.reset", },
  { name: "revert", descriptionKey: "commands.revert", },
  { name: "rename", descriptionKey: "commands.rename", requiredRole: "owner", },
  { name: "search", descriptionKey: "commands.search", },
  { name: "summarize", descriptionKey: "commands.summarize", },
];

/** Completer under test plus a counter of registry loads it triggered. */
interface Harness {
  completer: CommandCompleter;
  loads: () => number;
}

/**
 * @param loadRegistry - loader stub to inject; defaults to a successful fetch
 * @returns the completer under test plus its load counter
 */
function makeCompleter(
  loadRegistry: () => Promise<CommandListResult> = () => Promise.resolve({ ok: true, data: REGISTRY, },),
): Harness {
  const state = { loads: 0, };
  return {
    loads: () => state.loads,
    completer: new CommandCompleter({
      loadRegistry: () => {
        state.loads++;
        return loadRegistry();
      },
      onChange: () => {},
    },),
  };
}

/** A completer whose registry fetch always fails, recording every repaint. */
function makeFailingCompleter(hints: Array<string | null>,): CommandCompleter {
  const completer: CommandCompleter = new CommandCompleter({
    loadRegistry: () => Promise.resolve({ ok: false, error: "HTTP 500", },),
    onChange: () => {
      hints.push(completer.hint(),);
    },
  },);

  return completer;
}

/** Flush the microtask queue plus one task turn, so the one-shot load has landed. */
function settle(): Promise<void> {
  return new Promise((resolve,) => {
    setTimeout(resolve, 0,);
  },);
}

it("parses the command token out of the input box", () => {
  expect(parseCommandQuery("/re",),).toBe("re",);
  expect(parseCommandQuery("/",),).toBe("",);
  expect(parseCommandQuery("hello",),).toBeNull();
  // Arguments already typed means the command is settled.
  expect(parseCommandQuery("/reset now",),).toBeNull();
  expect(parseCommandQuery("",),).toBeNull();
});

it("filters the registry by case-insensitive prefix", () => {
  expect(matchCommands(REGISTRY, "re",).map((entry,) => entry.name),).toEqual([
    "reset",
    "revert",
    "rename",
  ],);

  expect(matchCommands(REGISTRY, "RE",).map((entry,) => entry.name),).toEqual([
    "reset",
    "revert",
    "rename",
  ],);

  // A bare slash offers the whole registry.
  expect(matchCommands(REGISTRY, "",),).toHaveLength(REGISTRY.length,);
  expect(matchCommands(REGISTRY, "zzz",),).toEqual([],);
});

it("fetches the registry lazily, once, on the first slash", async () => {
  const harness = makeCompleter();
  expect(harness.loads(),).toBe(0,);

  harness.completer.update("hello",);
  await settle();
  expect(harness.loads(),).toBe(0,);

  harness.completer.update("/re",);
  await settle();
  expect(harness.loads(),).toBe(1,);
  expect(harness.completer.hint(),).toContain("/reset",);

  // Further keystrokes re-filter the cached registry, never re-fetch.
  harness.completer.update("/sea",);
  await settle();
  expect(harness.loads(),).toBe(1,);
  expect(harness.completer.hint(),).toContain("/search",);
  expect(harness.completer.hint(),).not.toContain("/reset",);
});

it("cycles the selection and commits it on accept", async () => {
  const harness = makeCompleter();
  harness.completer.update("/re",);
  await settle();

  // Nothing is selected until the user asks — a bare Enter must still send.
  expect(harness.completer.selected(),).toBeNull();
  expect(harness.completer.accept(),).toBeNull();

  expect(harness.completer.cycle(),).toBe(true,);
  expect(harness.completer.selected()?.name,).toBe("reset",);
  expect(harness.completer.accept(),).toBe("/reset ",);
  // Committing drops the query: the strip clears, the box keeps the text.
  expect(harness.completer.hint(),).toBeNull();
  expect(harness.completer.selected(),).toBeNull();
});

it("wraps the selection at both ends of the match list", async () => {
  const harness = makeCompleter();
  harness.completer.update("/re",);
  await settle();

  harness.completer.cycle();
  harness.completer.cycle();
  expect(harness.completer.selected()?.name,).toBe("revert",);
  harness.completer.cycle();
  expect(harness.completer.selected()?.name,).toBe("rename",);
  harness.completer.cycle();
  expect(harness.completer.selected()?.name,).toBe("reset",);
  expect(harness.completer.accept(),).toBe("/reset ",);
});

it("falls back to plain text when the registry fetch fails", async () => {
  const harness = makeCompleter(() => Promise.resolve({ ok: false, error: "HTTP 500", },));
  harness.completer.update("/re",);
  await settle();

  // No crash, nothing selectable, Enter still sends the raw text.
  expect(harness.completer.cycle(),).toBe(false,);
  expect(harness.completer.accept(),).toBeNull();
  expect(harness.completer.hint(),).toBe('/ no command matches "re"',);

  // A failed fetch is settled: it does not retry on every keystroke.
  harness.completer.update("/sea",);
  await settle();
  expect(harness.loads(),).toBe(1,);
});

it("repaints once a failed fetch settles so the strip drops its loading hint", async () => {
  const hints: Array<string | null> = [];
  const c = makeFailingCompleter(hints,);
  c.update("/help",);
  await settle();
  // The owner's last repaint is the settled state: the loading hint painted
  // while in flight gets replaced rather than stranded on screen.
  expect(hints,).toEqual(["/ …loading commands", '/ no command matches "help"',],);
});

it("survives a rejecting loader without an unhandled rejection", async () => {
  const harness = makeCompleter(() => Promise.reject(new Error("boom",),));
  harness.completer.update("/re",);
  await settle();

  expect(harness.completer.cycle(),).toBe(false,);
  expect(harness.completer.accept(),).toBeNull();
});

it("drops the query when the input stops being a command", async () => {
  const harness = makeCompleter();
  harness.completer.update("/re",);
  await settle();
  harness.completer.cycle();

  harness.completer.update("re without the slash",);
  expect(harness.completer.hint(),).toBeNull();
  expect(harness.completer.cycle(),).toBe(false,);
});

it("reports matches while the registry is still in flight", () => {
  const harness = makeCompleter(() => new Promise<CommandListResult>(() => {},));
  harness.completer.update("/",);
  expect(harness.completer.hint(),).toBe("/ …loading commands",);
});

/** The valve-carrying fixture row, kept named so tests pass it directly. */
const REWRITE_DESCRIPTOR: CommandDescriptor = {
  name: "rewrite",
  descriptionKey: "commands.rewrite",
  valves: [
    {
      name: "style",
      type: "clear|concise|dramatic|formal",
      default: "clear",
      enum: ["clear", "concise", "dramatic", "formal",],
    },
    { name: "apply", type: "boolean", },
  ],
};

/** Registry fixture carrying valves, a bare regen and a plain command. */
const USAGE_REGISTRY: CommandDescriptor[] = [
  REWRITE_DESCRIPTOR,
  { name: "regen", descriptionKey: "commands.regen", },
  { name: "improve", descriptionKey: "commands.improve", },
];

/** Harness over {@link USAGE_REGISTRY}. */
function makeUsageCompleter(): Harness {
  return makeCompleter(() => Promise.resolve({ ok: true, data: USAGE_REGISTRY, },));
}

it("parses the settled command out of input with arguments", () => {
  expect(parseSettledCommand("/rewrite --style dramatic",),).toBe("rewrite",);
  expect(parseSettledCommand("/rewrite ",),).toBe("rewrite",);
  expect(parseSettledCommand("/rewrite",),).toBeNull();
  expect(parseSettledCommand("/ rew",),).toBeNull();
  expect(parseSettledCommand("rewrite --style",),).toBeNull();
  expect(parseSettledCommand("/",),).toBeNull();
});

it("renders the valve usage line for a valve descriptor", () => {
  expect(valveUsageLine(REWRITE_DESCRIPTOR,),).toBe(
    "--style (clear|concise|dramatic|formal, default clear), --apply (boolean)",
  );

  expect(valveUsageLine({ name: "improve", descriptionKey: "commands.improve", },),).toBeNull();
});

it("appends the valve usage when a single command matches", async () => {
  const harness = makeUsageCompleter();
  harness.completer.update("/rew",);
  await settle();

  const hint = harness.completer.hint();
  expect(hint,).toContain("--style (clear|concise|dramatic|formal, default clear)",);
  expect(hint,).toContain("Tab: cycle",);
});

it("shows the regen action vocabulary for /regen", async () => {
  const harness = makeUsageCompleter();
  harness.completer.update("/regen",);
  await settle();

  expect(harness.completer.hint(),).toContain("<try-again|add-details|more-concise>",);
});

it("switches to the usage hint while arguments are being typed", async () => {
  const harness = makeUsageCompleter();
  harness.completer.update("/rewrite --style dr",);
  await settle();

  const hint = harness.completer.hint();
  expect(hint,).toContain("/rewrite",);
  expect(hint,).toContain("--style",);
  expect(hint,).not.toContain("Tab: cycle",);
});

it("drops the hint for settled commands without a usage line", async () => {
  const harness = makeUsageCompleter();
  harness.completer.update("/improve ",);
  await settle();
  expect(harness.completer.hint(),).toBeNull();

  harness.completer.update("/nope ",);
  expect(harness.completer.hint(),).toBeNull();
});

it("leaves Enter and Tab to the caller while the usage hint is up", async () => {
  const harness = makeUsageCompleter();
  harness.completer.update("/rewrite --style dr",);
  await settle();

  // The usage hint must not swallow interaction: nothing is selected, so
  // accept() yields no commit text (Enter sends) and cycle() reports no
  // selection to advance (Tab passes through).
  expect(harness.completer.selected(),).toBeNull();
  expect(harness.completer.accept(),).toBeNull();
  expect(harness.completer.cycle(),).toBe(false,);
});

it("keeps the regen action vocabulary in parity with the backend", () => {
  expect(REGEN_ACTIONS.join("|",),).toBe(
    listMessageActions().map((action,) => action.id).join("|",),
  );
});

describe("loadCommands", () => {
  afterEach(() => {
    setFetch(realFetch,);
  },);

  /** Install a fetch stub that always answers with `payload`. */
  function stubResponse(payload: unknown,): void {
    setFetch(<T,>(): Promise<FetchResult<T>> =>
      Promise.resolve(
        payload as FetchResult<T>,
      )
    );
  }

  it("maps a failed response to an error result", async () => {
    stubResponse({ ok: false, status: 503, headers: new Headers(), error: new Error("busy",), },);

    expect(await loadCommands(undefined, null,),).toEqual({ ok: false, error: "HTTP 503", },);
  });

  it("unwraps the registry envelope and tolerates a missing data field", async () => {
    stubResponse({ ok: true, status: 200, headers: new Headers(), data: { data: REGISTRY, }, },);
    expect(await loadCommands("token", "chat-1",),).toEqual({ ok: true, data: REGISTRY, },);

    stubResponse({ ok: true, status: 200, headers: new Headers(), data: {}, },);
    expect(await loadCommands(undefined, null,),).toEqual({ ok: true, data: [], },);
  });

  it("reports a thrown transport error instead of rejecting", async () => {
    setFetch(() => Promise.reject(new Error("ECONNREFUSED",),));
    expect(await loadCommands(undefined, null,),).toEqual({ ok: false, error: "ECONNREFUSED", },);
  });
});
