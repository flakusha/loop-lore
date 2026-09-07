import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import { commandPalette, } from "./command-palette";

// ── Mock ../htmx (must precede importing ./command-palette) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

mock.module("../htmx", () => ({
  apiFetch: (async (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  commandPalette._commandList = [];
  commandPalette._filteredCommands = [];
  commandPalette._showCommandPalette = false;
  commandPalette._activeCommand = "";
});

afterEach(() => {
  calls = [];
});

interface PaletteCtx {
  $refs?: { messageInput: { value: string; focus: () => void } };
  _showCommandPalette: boolean;
  _commandList: { name: string; descriptionKey: string; description: string }[];
  _filteredCommands: { name: string; descriptionKey: string; description: string }[];
}

function buildCtx(withInput?: boolean,): PaletteCtx {
  return {
    $refs: withInput
      ? { messageInput: { value: "", focus: () => {}, }, }
      : undefined,
    _showCommandPalette: false,
    _commandList: [],
    _filteredCommands: [],
  } as PaletteCtx;
}

const listFixture = [
  { name: "roll", descriptionKey: "k1", description: "d1", },
  { name: "insult", descriptionKey: "k2", description: "d2", },
];

describe("commandPalette._loadCommandList", () => {
  test("maps server entries into the command list", async () => {
    handler = async () => Response.json({ data: [
      { name: "roll", descriptionKey: "commands.roll", },
      { name: "insult", descriptionKey: "commands.insult", },
    ], },);
    await commandPalette.init!();
    expect(calls,).toHaveLength(1,);
    expect(calls[0]!.url,).toBe("/api/commands",);
    expect(commandPalette._commandList!.map((c,) => [c.name, c.descriptionKey,],),).toEqual([
      ["roll", "commands.roll",],
      ["insult", "commands.insult",],
    ],);
    for (const entry of commandPalette._commandList!) {
      expect(typeof entry.description,).toBe("string",);
    }
    expect(commandPalette._filteredCommands,).toEqual([],);
  });

  test("refreshes the filtered list while the palette is open", async () => {
    commandPalette._showCommandPalette = true;
    handler = async () => Response.json({ data: [{ name: "roll", descriptionKey: "k", },], },);
    await commandPalette._loadCommandList!();
    expect(commandPalette._filteredCommands,).toHaveLength(1,);
  });

  test("tolerates missing data arrays, non-ok responses and throws", async () => {
    handler = async () => Response.json({},);
    await commandPalette._loadCommandList!();
    expect(commandPalette._commandList,).toEqual([],);
    handler = async () => new Response("", { status: 500, },);
    await commandPalette._loadCommandList!();
    expect(commandPalette._commandList,).toEqual([],);
    handler = async () => {
      throw new Error("offline",);
    };
    await commandPalette._loadCommandList!();
    expect(commandPalette._commandList,).toEqual([],);
  });
});

describe("commandPalette.handleCommandInput", () => {
  function inputEvent(value: string,): Event {
    return { target: { value }, } as unknown as Event;
  }

  test("opens the palette for slash prefixes and filters by substring", () => {
    const ctx = buildCtx();
    ctx._commandList = listFixture.map((c,) => ({ ...c }),);
    commandPalette.handleCommandInput!.call(ctx as never, inputEvent("/INS",),);
    expect(ctx._showCommandPalette,).toBe(true,);
    expect(ctx._filteredCommands,).toEqual([{ name: "insult", descriptionKey: "k2", description: "d2", },],);
  });

  test("a bare slash shows everything; text with a space closes it", () => {
    const ctx = buildCtx();
    ctx._commandList = listFixture.map((c,) => ({ ...c }),);
    commandPalette.handleCommandInput!.call(ctx as never, inputEvent("/",),);
    expect(ctx._showCommandPalette,).toBe(true,);
    expect(ctx._filteredCommands,).toEqual(listFixture,);
    commandPalette.handleCommandInput!.call(ctx as never, inputEvent("/roll 2d6",),);
    expect(ctx._showCommandPalette,).toBe(false,);
    commandPalette.handleCommandInput!.call(ctx as never, inputEvent("hello",),);
    expect(ctx._showCommandPalette,).toBe(false,);
  });

  test("a slash query with no matches yields an empty filtered list", () => {
    const ctx = buildCtx();
    ctx._commandList = [{ name: "roll", descriptionKey: "k", description: "d", },];
    commandPalette.handleCommandInput!.call(ctx as never, inputEvent("/zzz",),);
    expect(ctx._showCommandPalette,).toBe(true,);
    expect(ctx._filteredCommands,).toEqual([],);
  });
});

describe("commandPalette.selectCommand", () => {
  test("fills the input and closes the palette", () => {
    const ctx = buildCtx(true,);
    commandPalette.selectCommand!.call(ctx as never, "roll",);
    expect(ctx.$refs!.messageInput.value,).toBe("/roll ",);
    expect(ctx._showCommandPalette,).toBe(false,);
  });

  test("works without a message input ref", () => {
    const ctx = buildCtx();
    commandPalette.selectCommand!.call(ctx as never, "roll",);
    expect(ctx._showCommandPalette,).toBe(false,);
  });
});
