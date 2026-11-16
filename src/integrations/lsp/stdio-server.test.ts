// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LSP stdio server tests (editor-LSP first slice): initialize handshake,
 * didOpen/didChange tracking, single-item completion, unauthenticated
 * rejection, and the completion path performing no writes.
 *
 * Resource contract: ONE in-memory migrated DB per test (its own
 * user/actor/chat/token ids), the process-shared admin-settings store
 * (seeded and reset around every test), in-memory fake adapters, and one
 * exec-log file in a temp dir (reset to the repo default afterwards). No
 * child process, no ports, no cross-test state.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { HarnessAcpConfig, } from "../../config/schema/harness";
import { resetExecLogPath, setExecLogPath, } from "../../harness/exec-log";
import { mintIntegrationToken, } from "../../middleware/auth/integration-token";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertIntegrationTokens, } from "../../test-utils/insert-helpers";
import {
  initHarnessAdminSettings,
  resetHarnessAdminSettings,
} from "../harness/admin-settings";
import {
  dispatchHarnessTurn,
  type DispatchHarnessTurnOptions,
  type DispatchHarnessTurnOutcome,
} from "../harness/dispatch";
import { fakeFactory, } from "../harness/fakes";
import { WRITE_OR_EXEC_TOOL_KINDS, } from "../harness/permission-policy";
import { createHarnessRuntime, } from "../harness/runtime";
import { CompletionTimeoutError, createCompletionDispatcher, } from "./completion";
import { type OpenDoc, trackDidChange, trackDidOpen, } from "./documents";
import { createLspMessageHandler, type InboundLspDeps, } from "./handler";
import {
  buildCompletionPrompt,
  COMPLETION_CONTEXT_LIMIT,
  COMPLETION_READ_ONLY_DIRECTIVE,
} from "./prompt";
import { createLspFrameParser, LSP_ERRORS, } from "./protocol";

let userId: string;
let actorId: string;
let chatId: string;
let tag = "";
let idCounter = 0;

let fixture: TestDb;
let execLog: string;

/** The ACP config the admin store and the runtime are seeded with. */
function acpConfig(): HarnessAcpConfig {
  return {
    enabled: true,
    profiles: [
      {
        name: "omp",
        command: ["omp",],
        tiers: { fast: { model: "zai/flash", capabilities: ["tools",], }, },
        tosGrayzoneAcknowledged: true,
      },
    ],
  };
}

beforeEach(async () => {
  tag = `lsp${++idCounter}`;
  userId = `user-lsp-${tag}`;
  actorId = `actor-lsp-${tag}`;
  chatId = `chat-lsp-${tag}`;
  fixture = await createTestDb();
  execLog = join(mkdtempSync(join(tmpdir(), "lsp-stdio-",),), "executions.jsonl",);
  setExecLogPath(execLog,);
  initHarnessAdminSettings(acpConfig(),);

  await fixture.db.insertInto("users",).values({
    id: userId,
    username: `lsp-${tag}`,
    display_name: "LSP",
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();

  await insertActors(fixture.db, "LSP Actor", {
    id: actorId,
    actor_type: "character",
    owner_id: userId,
    agent_type: "ai",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
  } as never,);

  await fixture.db.insertInto("chats",).values({
    id: chatId,
    name: "LSP",
    type: "direct",
    mode: "direct",
    created_by: userId,
    max_turns: null,
  } as never,).execute();
},);

afterEach(async () => {
  resetHarnessAdminSettings();
  resetExecLogPath();
  await destroyTestDb(fixture,);
},);

/** Seed an integration token for `issuer` and return its RAW bearer value. */
async function seedToken(issuer: string,): Promise<string> {
  const { raw, hash, } = mintIntegrationToken();
  await insertIntegrationTokens(fixture.db, "lsp-editor", hash, "read", issuer,);
  return raw;
}

/** One captured server write. */
interface Captured {
  id: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Drive the handler with stub dispatch; returns the writes and prompt spy. */
function connectStubbed(reply: string, deps?: Partial<InboundLspDeps>,): {
  handle: (text: string,) => Promise<void>;
  writes: Captured[];
  prompts: string[];
} {
  const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], reply: "unused", }, },);
  const writes: Captured[] = [];
  const prompts: string[] = [];
  const handle = createLspMessageHandler({
    database: fixture.db,
    runtime: createHarnessRuntime({ acp: acpConfig(), factory, },),
    profile: "omp",
    chatId,
    actorId,
    debounceMs: 0,
    dispatchTurn: async (options: DispatchHarnessTurnOptions,): Promise<DispatchHarnessTurnOutcome> => {
      prompts.push(options.prompt,);
      return {
        turn: {
          profile: "omp",
          tier: "fast",
          model: "zai/flash",
          result: {
            text: reply,
            stopReason: "end_turn",
            usage: null,
            costUsd: null,
            acpSessionId: null,
            transcript: { text: "", thinking: [], toolCalls: [], toolResults: [], },
          },
        },
        messageId: "stub-message",
      } as DispatchHarnessTurnOutcome;
    },
    ...deps,
  }, (message,) => {
    writes.push(message as Captured,);
  },);

  return { handle, writes, prompts, };
}

const msg = (method: string, params: unknown, id: number | string | null = 1,): string =>
  JSON.stringify(id === null ? { jsonrpc: "2.0", method, params, } : { jsonrpc: "2.0", id, method, params, },);

const byId = (writes: Captured[], id: number | string,): Captured => {
  const found = writes.find((w,) => w.id === id);
  expect(found,).toBeDefined();
  return found as Captured;
};

describe("lsp initialize", () => {
  it("answers the handshake with full-sync + completion capabilities", async () => {
    // No chatId/actorId deps: exercises the per-connection binding ensure.
    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], reply: "x", }, },);
    const writes: Captured[] = [];
    const handle = createLspMessageHandler({
      database: fixture.db,
      runtime: createHarnessRuntime({ acp: acpConfig(), factory, },),
      debounceMs: 0,
      dispatchTurn: async () => ({ turn: null, messageId: "x", } as unknown as DispatchHarnessTurnOutcome),
    }, (message,) => {
      writes.push(message as Captured,);
    },);

    const raw = await seedToken(userId,);
    await handle(msg("initialize", { initializationOptions: { token: raw, }, rootUri: "file:///ws", }, 1,),);

    const answer = byId(writes, 1,);
    const capabilities = (answer.result as Record<string, unknown>)["capabilities"] as Record<string, unknown>;
    expect(capabilities["textDocumentSync"],).toBe(1,);
    expect(capabilities["completionProvider"],).toBeDefined();
    const serverInfo = (answer.result as Record<string, unknown>)["serverInfo"] as Record<string, unknown>;
    expect(serverInfo["name"],).toBe("loop-lore-lsp",);
  });

  it("rejects an unknown token and refuses completion while unauthenticated", async () => {
    const { handle, writes, prompts, } = connectStubbed("x",);

    await handle(msg("initialize", { initializationOptions: { token: "llri_bogus", }, }, 1,),);
    expect(byId(writes, 1,).error?.code,).toBe(LSP_ERRORS.requestFailed,);

    await handle(msg("textDocument/completion", {
      textDocument: { uri: "file:///a.ts", },
      position: { line: 0, character: 0, },
    }, 2,),);

    expect(byId(writes, 2,).error?.code,).toBe(LSP_ERRORS.serverNotInitialized,);
    expect(prompts,).toHaveLength(0,);
  });

  it("rejects a missing token", async () => {
    const { handle, writes, } = connectStubbed("x",);
    await handle(msg("initialize", {}, 1,),);
    expect(byId(writes, 1,).error?.code,).toBe(LSP_ERRORS.requestFailed,);
  });
});

describe("lsp completion", () => {
  const docUri = "file:///ws/main.ts";

  async function openAndComplete(reply: string, docText: string,) {
    const { handle, writes, prompts, } = connectStubbed(reply,);
    const raw = await seedToken(userId,);
    await handle(msg("initialize", { initializationOptions: { token: raw, }, }, 1,),);
    await handle(msg("textDocument/didOpen", {
      textDocument: { uri: docUri, languageId: "typescript", version: 1, text: docText, },
    }, null,),);

    await handle(msg("textDocument/completion", {
      textDocument: { uri: docUri, },
      position: { line: 1, character: 2, },
    }, 2,),);

    return { writes, prompts, };
  }

  it("returns a single-item list sourced from the dispatch text", async () => {
    const { writes, } = await openAndComplete("  fetchUser(id)", "const x = 1;\n  \n",);
    const answer = byId(writes, 2,);
    const items = (answer.result as Record<string, unknown>)["items"] as Array<Record<string, unknown>>;
    expect((answer.result as Record<string, unknown>)["isIncomplete"],).toBe(false,);
    expect(items,).toHaveLength(1,);
    expect(items[0]?.["insertText"],).toBe("fetchUser(id)",);
    expect(items[0]?.["label"],).toBe("fetchUser(id)",);
  });

  it("tracks didOpen then didChange text in the dispatched prompt", async () => {
    const { handle, writes, prompts, } = connectStubbed("done",);
    const raw = await seedToken(userId,);
    await handle(msg("initialize", { initializationOptions: { token: raw, }, }, 1,),);
    await handle(msg("textDocument/didOpen", {
      textDocument: { uri: docUri, languageId: "typescript", version: 1, text: " stale", },
    }, null,),);

    await handle(msg("textDocument/didChange", {
      textDocument: { uri: docUri, version: 2, },
      contentChanges: [{ text: "const fresh = true;", },],
    }, null,),);

    await handle(msg("textDocument/completion", {
      textDocument: { uri: docUri, },
      position: { line: 0, character: 5, },
    }, 2,),);

    expect(byId(writes, 2,).error,).toBeUndefined();
    expect(prompts,).toHaveLength(1,);
    expect(prompts[0],).toContain("const fresh = true;",);
    expect(prompts[0],).not.toContain("stale",);
  });

  it("rejects completion for an unopened document", async () => {
    const { handle, writes, } = connectStubbed("x",);
    const raw = await seedToken(userId,);
    await handle(msg("initialize", { initializationOptions: { token: raw, }, }, 1,),);
    await handle(msg("textDocument/completion", {
      textDocument: { uri: "file:///never-opened.ts", },
      position: { line: 0, character: 0, },
    }, 2,),);

    expect(byId(writes, 2,).error?.code,).toBe(LSP_ERRORS.invalidParams,);
  });

  it("answers an empty dispatch with an empty list", async () => {
    const { writes, } = await openAndComplete("   \n  ", "x",);
    const answer = byId(writes, 2,);
    expect((answer.result as Record<string, unknown>)["items"],).toEqual([],);
  });

  it("times out a parked disobedient turn to an incomplete empty list, then serves the next completion", async () => {
    let calls = 0;
    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], reply: "unused", }, },);
    const writes: Captured[] = [];
    const prompts: string[] = [];
    const handle = createLspMessageHandler({
      database: fixture.db,
      runtime: createHarnessRuntime({ acp: acpConfig(), factory, },),
      profile: "omp",
      chatId,
      actorId,
      debounceMs: 0,
      timeoutMs: 20,
      dispatchTurn: (options: DispatchHarnessTurnOptions,): Promise<DispatchHarnessTurnOutcome> => {
        prompts.push(options.prompt,);
        calls += 1;
        if (calls === 1) {
          // Disobedient turn: the write/exec ask parks with no timeout — never settles.
          return new Promise<DispatchHarnessTurnOutcome>(() => {},);
        }

        return Promise.resolve({
          turn: {
            profile: "omp",
            tier: "fast",
            model: "zai/flash",
            result: {
              text: "  recovered()",
              stopReason: "end_turn",
              usage: null,
              costUsd: null,
              acpSessionId: null,
              transcript: { text: "", thinking: [], toolCalls: [], toolResults: [], },
            },
          },
          messageId: "second-turn",
        } as DispatchHarnessTurnOutcome,);
      },
    }, (message,) => {
      writes.push(message as Captured,);
    },);

    const raw = await seedToken(userId,);
    await handle(msg("initialize", { initializationOptions: { token: raw, }, }, 1,),);
    await handle(msg("textDocument/didOpen", {
      textDocument: { uri: docUri, languageId: "typescript", version: 1, text: "const a = ", },
    }, null,),);

    await handle(msg("textDocument/completion", {
      textDocument: { uri: docUri, },
      position: { line: 0, character: 10, },
    }, 2,),);

    expect(byId(writes, 2,).result,).toEqual({ isIncomplete: true, items: [], },);

    // The prompt still carried the read-only directive the agent disobeyed.
    expect(prompts[0],).toContain(COMPLETION_READ_ONLY_DIRECTIVE.split("\n",)[0],);

    await handle(msg("textDocument/completion", {
      textDocument: { uri: docUri, },
      position: { line: 0, character: 10, },
    }, 3,),);

    // Single-flight was released: the next completion dispatches fresh and answers.
    const items = (byId(writes, 3,).result as Record<string, unknown>)["items"] as Array<Record<string, unknown>>;
    expect(items,).toHaveLength(1,);
    expect(items[0]?.["insertText"],).toBe("recovered()",);
  });
});

describe("lsp completion path performs no writes", () => {
  it("dispatches a read-only prompt, makes no write/exec tool calls, and audits the turn", async () => {
    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], reply: "  done()", }, },);
    const runtime = createHarnessRuntime({ acp: acpConfig(), factory, },);
    const writes: Captured[] = [];
    const seen: DispatchHarnessTurnOutcome[] = [];
    const prompts: string[] = [];
    const handle = createLspMessageHandler({
      database: fixture.db,
      runtime,
      // Default profile resolution (first configured) is exercised here.
      chatId,
      actorId,
      debounceMs: 0,
      dispatchTurn: async (options: DispatchHarnessTurnOptions,): Promise<DispatchHarnessTurnOutcome> => {
        prompts.push(options.prompt,);
        const outcome = await dispatchHarnessTurn(options,);
        seen.push(outcome,);
        return outcome;
      },
    }, (message,) => {
      writes.push(message as Captured,);
    },);

    const raw = await seedToken(userId,);
    await handle(msg("initialize", { initializationOptions: { token: raw, }, }, 1,),);
    await handle(msg("textDocument/didOpen", {
      textDocument: { uri: "file:///ws/a.ts", languageId: "typescript", version: 1, text: "const a = ", },
    }, null,),);

    await handle(msg("textDocument/completion", {
      textDocument: { uri: "file:///ws/a.ts", },
      position: { line: 0, character: 10, },
    }, 2,),);

    // The completion list still answers from the real dispatch.
    const items = (byId(writes, 2,).result as Record<string, unknown>)["items"] as unknown[];
    expect(items,).toHaveLength(1,);

    // The prompt carries the read-only directive naming the forbidden kinds.
    expect(seen,).toHaveLength(1,);
    expect(prompts,).toHaveLength(1,);
    const outcome = seen[0] as DispatchHarnessTurnOutcome;
    expect(prompts[0],).toContain(COMPLETION_READ_ONLY_DIRECTIVE.split("\n",)[0],);

    // No write/exec tool call in the turn transcript.
    for (const call of outcome.turn.result.transcript.toolCalls) {
      expect(call.kind === null || !(WRITE_OR_EXEC_TOOL_KINDS as readonly string[]).includes(call.kind,),).toBe(true,);
    }

    // Audited like other harness turns: one assistant row + one exec-log line.
    const rows = await fixture.db.selectFrom("messages",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(rows.some((row,) => row.role === "assistant" && row.id === outcome.messageId),).toBe(true,);
    expect(existsSync(execLog,),).toBe(true,);
    const lines = readFileSync(execLog, "utf8",).split("\n",).filter((line,) => line.trim().length > 0);
    expect(lines,).toHaveLength(1,);
    expect(JSON.parse(lines[0] as string,) as { profile?: string },).toMatchObject({ profile: "omp", },);
  });
});

describe("lsp framing", () => {
  it("reassembles Content-Length frames split across chunks, multibyte-safe", async () => {
    const bodies: string[] = [];
    const feed = createLspFrameParser((text,) => {
      bodies.push(text,);
    },);

    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "shutdown", },);
    const framed = `Content-Length: ${Buffer.byteLength(body,)}\r\n\r\n${body}`;
    const bytes = Buffer.from(framed,);
    // Split inside the header, inside the body, and inside a multibyte char.
    const multi = JSON.stringify({ note: "héllo", },);
    const multiFramed = Buffer.concat([
      Buffer.from(`Content-Length: ${Buffer.byteLength(multi,)}\r\n\r\n`,),
      Buffer.from(multi,),
    ],);

    const charSplit = multiFramed.indexOf(Buffer.from("é",),) + 1;

    feed(bytes.subarray(0, 10,),);
    feed(bytes.subarray(10, 20,),);
    feed(bytes.subarray(20,),);
    feed(multiFramed.subarray(0, charSplit,),);
    feed(multiFramed.subarray(charSplit,),);

    expect(bodies,).toEqual([body, multi,],);
  });
});

describe("lsp shutdown", () => {
  it("answers shutdown and exits 0 after exit; exits 1 without shutdown", async () => {
    const exits: number[] = [];
    const { handle, writes, } = connectStubbed("x", {
      onExit: (code,) => {
        exits.push(code,);
      },
    },);

    const raw = await seedToken(userId,);
    await handle(msg("initialize", { initializationOptions: { token: raw, }, }, 1,),);
    await handle(msg("shutdown", {}, 2,),);
    expect(byId(writes, 2,).result,).toBeNull();
    await handle(msg("exit", {}, null,),);
    expect(exits,).toEqual([0,],);

    const second = connectStubbed("x", {
      onExit: (code,) => {
        exits.push(code,);
      },
    },);

    await second.handle(msg("exit", {}, null,),);
    expect(exits,).toEqual([0, 1,],);
  });
});

describe("lsp completion prompt", () => {
  it("carries the full text when under the context limit", () => {
    const text = "const a = 1;\nconst b = 2;\n";
    const prompt = buildCompletionPrompt({
      uri: "file:///ws/a.ts",
      languageId: "typescript",
      text,
      line: 1,
      character: 3,
    },);

    expect(COMPLETION_CONTEXT_LIMIT,).toBe(16_000,);
    expect(prompt,).toContain(COMPLETION_READ_ONLY_DIRECTIVE.split("\n",)[0] ?? "",);
    expect(prompt,).toContain(text,);
    expect(prompt,).not.toContain("truncated",);
    expect(prompt,).toContain("Cursor: line 1, character 3",);
  });

  it("windows an over-limit document around the cursor", () => {
    const before = "x".repeat(14_000,);
    const after = "y".repeat(5_000,);
    const text = `${before}\n${after}`;
    expect(text.length,).toBeGreaterThan(COMPLETION_CONTEXT_LIMIT,);

    const prompt = buildCompletionPrompt({
      uri: "file:///ws/big.ts",
      languageId: "typescript",
      text,
      line: 1,
      character: after.length,
    },);

    expect(prompt,).toContain("(truncated to the cursor window)",);
    // The cursor-centred window keeps the tail; the far head is cut.
    expect(prompt,).toContain(after,);
    expect(prompt,).not.toContain(before,);
    expect(prompt.length,).toBeLessThan(text.length,);
  });

  it("clamps out-of-range cursors and handles empty text", () => {
    const clamped = buildCompletionPrompt({
      uri: "file:///ws/a.ts",
      languageId: "typescript",
      text: "ab\ncd",
      line: 99,
      character: 99,
    },);

    expect(clamped,).toContain("Cursor: line 1, character 2",);

    const empty = buildCompletionPrompt({
      uri: "file:///ws/empty.ts",
      languageId: "plaintext",
      text: "",
      line: 0,
      character: 0,
    },);

    expect(empty,).toContain("Cursor: line 0, character 0",);
    expect(empty,).toContain("Context:\n\n\nCompletion:",);
  });
});

describe("lsp documents", () => {
  it("tracks didOpen with defaults for missing fields and ignores malformed docs", () => {
    const docs = new Map<string, OpenDoc>();
    trackDidOpen(docs, { textDocument: { uri: "file:///a.ts", text: "hi", }, },);
    expect(docs.get("file:///a.ts",),).toEqual({ languageId: "plaintext", version: 0, text: "hi", },);

    trackDidOpen(docs, { textDocument: { uri: 42, text: "hi", }, },);
    trackDidOpen(docs, {},);
    expect(docs.size,).toBe(1,);
  });

  it("applies didChange full-sync with last text winning and skips bad shapes", () => {
    const docs = new Map<string, OpenDoc>();
    trackDidChange(docs, {
      textDocument: { uri: "file:///a.ts", },
      contentChanges: [{ text: "one", }, { text: "two", }, { text: 7, }, "nope",],
    },);

    expect(docs.get("file:///a.ts",)?.text,).toBe("two",);

    trackDidChange(docs, { textDocument: { uri: 1, }, contentChanges: "nope", },);
    expect(docs.size,).toBe(1,);
  });
});

describe("lsp completion dispatcher", () => {
  it("seats the actor binding and dispatches trimmed text", async () => {
    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], reply: "unused", }, },);
    const dispatcher = createCompletionDispatcher({
      database: fixture.db,
      runtime: createHarnessRuntime({ acp: acpConfig(), factory, },),
      role: "solo",
      userId,
      profile: "omp",
      chatId: "",
      actorId: "",
      dispatchTurn: async () => ({
        turn: { result: { text: "  done()", }, },
        messageId: "dispatcher-stub",
      } as unknown as DispatchHarnessTurnOutcome),
      debounceMs: 0,
    },);

    await dispatcher.ensureBinding(userId,);
    const actor = await fixture.db.selectFrom("actors",).select("id",).where("id", "=", userId,).executeTakeFirst();
    expect(actor?.id,).toBe(userId,);

    const text = await dispatcher.requestCompletion({
      doc: { languageId: "typescript", version: 1, text: "const a = ", },
      uri: "file:///a.ts",
      line: 0,
      character: 10,
    },);

    expect(text,).toBe("done()",);
  });

  it("rejects a hung dispatch with CompletionTimeoutError, then serves the next completion", async () => {
    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], reply: "unused", }, },);
    let calls = 0;
    const dispatcher = createCompletionDispatcher({
      database: fixture.db,
      runtime: createHarnessRuntime({ acp: acpConfig(), factory, },),
      role: "solo",
      userId,
      profile: "omp",
      chatId: "",
      actorId: "",
      dispatchTurn: () => {
        calls += 1;
        if (calls === 1) {
          return new Promise<DispatchHarnessTurnOutcome>(() => {},);
        }

        return Promise.resolve({
          turn: { result: { text: "  back()", }, },
          messageId: "recovered",
        } as unknown as DispatchHarnessTurnOutcome,);
      },
      debounceMs: 0,
      timeoutMs: 20,
    },);

    const target = {
      doc: { languageId: "typescript", version: 1, text: "const a = ", },
      uri: "file:///a.ts",
      line: 0,
      character: 10,
    };

    await expect(dispatcher.requestCompletion(target,),).rejects.toBeInstanceOf(CompletionTimeoutError,);
    await expect(dispatcher.requestCompletion(target,),).resolves.toBe("back()",);
  });
});
