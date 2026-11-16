// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * inbound editor-LSP server — stdio Content-Length-framed JSON-RPC (first
 * slice: initialize/shutdown, didOpen/didChange tracking, single-item
 * `textDocument/completion`).
 *
 * The completion path is a READ-ONLY `dispatchHarnessTurn` call: the prompt
 * carries an explicit read-only directive, so the harness permission queue
 * (`classifyPermission`) stays on auto-allow and write/exec asks park. The
 * turn itself is audited exactly like every other harness turn (exec-log
 * line + persisted message rows via the dispatch's turn sink).
 *
 * Auth: `initialize` params' `initializationOptions.token` resolves through
 * the existing integration-token seam to the issuing admin's userId; the
 * role rides from that admin's users row, and `dispatchHarnessTurn` enforces
 * the isolation gate (master switch + admin role + profile allowlist).
 *
 * Run standalone (`bun run src/integrations/lsp/stdio-server.ts`); an editor
 * spawns it with a stock LSP client config. Deferred: completionItem/resolve,
 * inlineCompletion, codeAction/chat, per-editor plugins.
 */

import type { Kysely, } from "kysely";
import { createChat, } from "../../chat/service/crud/create";
import { APP_VERSION, } from "../../config/constants";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import { getDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { createLogger, getLogger, } from "../../logger";
import { verifyIntegrationToken, } from "../../middleware/auth/integration-token";
import { safeJsonParse, safeJsonStringify, } from "../../utils";
import {
  applyStoredHarnessSettings,
  getHarnessAdminFileConfig,
  initHarnessAdminSettings,
} from "../harness/admin-settings";
import {
  dispatchHarnessTurn,
  type DispatchHarnessTurnOptions,
  type DispatchHarnessTurnOutcome,
} from "../harness/dispatch";
import { WRITE_OR_EXEC_TOOL_KINDS, } from "../harness/permission-policy";
import { getHarnessRuntime, type HarnessRuntime, initHarnessRuntime, } from "../harness/runtime";

/** JSON-RPC error codes this server answers with (LSP + JSON-RPC standard). */
export const LSP_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  serverNotInitialized: -32002,
  /** Auth and dispatch failures (LSP `RequestFailed`). */
  requestFailed: -32803,
} as const;

/** `TextDocumentSyncKind.Full` — clients send the whole document on change. */
const TEXT_DOCUMENT_SYNC_FULL = 1;

/** `CompletionItemKind.Text` — the only kind this slice returns. */
const COMPLETION_ITEM_KIND_TEXT = 1;

/** Trailing debounce before a completion dispatches (ms); injectable for tests. */
const DEFAULT_DEBOUNCE_MS = 150;

/** Widest document window a completion prompt carries (chars, cursor-centred). */
// ponytail: naive char cap, not token-aware; per-language chunking if prompts bloat.
export const COMPLETION_CONTEXT_LIMIT = 16_000;

/**
 * The read-only directive every completion prompt carries: the agent must
 * answer with completion text only, so its tool calls (if any) classify as
 * read-only and `classifyPermission` stays on auto-allow — never write,
 * never exec on the completion path.
 */
export const COMPLETION_READ_ONLY_DIRECTIVE = [
  "READ-ONLY COMPLETION: reply with ONLY the code/text that completes the cursor position.",
  "Do NOT edit files, run commands, or call write/execute tools — read-only context only.",
  `Write/exec tool kinds (${WRITE_OR_EXEC_TOOL_KINDS.join(", ",)}) are never approved on this path.`,
].join("\n",);

/** Deps one LSP stdio connection needs, injectable for tests. */
export interface InboundLspDeps {
  /** The database turns persist into and tokens verify against. */
  database: Kysely<DB>;
  /** The composed harness runtime (production: the boot singleton). */
  runtime: HarnessRuntime;
  /** Harness profile to dispatch on; default: the first configured profile. */
  profile?: string;
  /** Chat completions audit into; default: a fresh "Editor LSP" chat per connection. */
  chatId?: string;
  /** Actor completions attribute to; default: an actor row for the authenticated user. */
  actorId?: string;
  /** Completion debounce window; default 150ms, 0 in tests. */
  debounceMs?: number;
  /** Dispatch seam; default the real `dispatchHarnessTurn` (read-only prompt). */
  dispatchTurn?: (options: DispatchHarnessTurnOptions,) => Promise<DispatchHarnessTurnOutcome>;
  /** Exit sink; default in `main` is `process.exit`. */
  onExit?: (code: number,) => void;
}

/** One tracked open document. */
interface OpenDoc {
  languageId: string;
  version: number;
  text: string;
}

/** What one completion runs against: the tracked doc, its uri, and the cursor. */
interface CompletionTarget {
  doc: OpenDoc;
  uri: string;
  line: number;
  character: number;
}

/** Input for {@link buildCompletionPrompt}. */
export interface CompletionPromptInput {
  uri: string;
  languageId: string;
  text: string;
  line: number;
  character: number;
}

/**
 * Build the read-only completion prompt for one cursor position: the
 * directive, the cursor-centred document window, and nothing else (no repo
 * reads here — the client sends the document text).
 * @param input - document uri, language, text, and cursor
 * @returns the prompt `dispatchHarnessTurn` runs
 */
export function buildCompletionPrompt(input: CompletionPromptInput,): string {
  const lines = input.text.split("\n",);
  const line = Math.max(0, Math.min(input.line, Math.max(0, lines.length - 1,),),);
  const character = Math.max(0, Math.min(input.character, (lines[line] ?? "").length,),);

  let offset = 0;
  for (let i = 0; i < line; i++) { offset += (lines[i] ?? "").length + 1; }
  offset += character;

  // Cursor-centred window: most context wants to be *before* the cursor.
  const windowText = input.text.length > COMPLETION_CONTEXT_LIMIT
    ? input.text.slice(Math.max(0, offset - 12_000,), Math.min(input.text.length, offset + 4_000,),)
    : input.text;

  const truncated = windowText.length !== input.text.length ? " (truncated to the cursor window)" : "";

  return [
    COMPLETION_READ_ONLY_DIRECTIVE,
    "",
    `File: ${input.uri} (${input.languageId})${truncated}`,
    `Cursor: line ${line}, character ${character}`,
    "Context:",
    windowText,
    "",
    "Completion:",
  ].join("\n",);
}

/** One parsed JSON-RPC message (batch arrays are rejected, not served). */
interface LspMessage {
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

/**
 * Build the per-connection message handler: feed it one complete JSON-RPC
 * message text, it answers through `write`. Exported (instead of hard-wiring
 * stdio) so tests drive the SAME handler graph without spawning a process.
 * @param deps - database, runtime, and binding overrides for the connection
 * @param write - sink for the server's response objects (production: framed stdout)
 * @returns the message handler for one stdio connection
 */
export function createLspMessageHandler(
  deps: InboundLspDeps,
  write: (message: unknown,) => void,
): (text: string,) => Promise<void> {
  const dispatchTurn = deps.dispatchTurn ?? dispatchHarnessTurn;
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const onExit = deps.onExit ?? ((): void => {/* no exit sink outside production */});

  const docs = new Map<string, OpenDoc>();
  let initialized = false;
  let userId: string | null = null;
  let role: string | null = null;
  let profile = deps.profile ?? "";
  let chatId = deps.chatId ?? "";
  let actorId = deps.actorId ?? "";
  let shutdownRequested = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<string> | null = null;

  const respond = (id: unknown, result: unknown,): void => {
    write({ jsonrpc: "2.0", id: id ?? null, result, },);
  };

  const fail = (id: unknown, code: number, message: string,): void => {
    write({ jsonrpc: "2.0", id: id ?? null, error: { code, message, }, },);
  };

  const dispatchCompletion = async (target: CompletionTarget,): Promise<string> => {
    const prompt = buildCompletionPrompt({
      uri: target.uri,
      languageId: target.doc.languageId,
      text: target.doc.text,
      line: target.line,
      character: target.character,
    },);

    const outcome = await dispatchTurn({
      runtime: deps.runtime,
      role,
      userId,
      profile,
      prompt,
      database: deps.database,
      chatId,
      actorId,
    },);

    return outcome.turn.result.text.trim();
  };

  const runExclusive = async (target: CompletionTarget,): Promise<string> => {
    // Single-flight, sequential (never concurrent): a completion that fires
    // while one is in flight waits for it, then dispatches fresh — no stale
    // text for a moved cursor, no overlapping turns on one connection.
    if (inFlight !== null) {
      try {
        await inFlight;
      } catch { /* the waiter reports its own error */ }
    }

    const run = dispatchCompletion(target,);
    inFlight = run;
    try {
      return await run;
    } finally {
      if (inFlight === run) { inFlight = null; }
    }
  };

  const debouncedCompletion = (target: CompletionTarget,): Promise<string> => {
    const { promise, resolve, reject, } = Promise.withResolvers<string>();
    clearTimeout(timer,);
    timer = setTimeout(() => {
      timer = undefined;
      void runExclusive(target,).then(resolve, reject,);
    }, debounceMs,);

    return promise;
  };

  const ensureBinding = async (authenticatedUserId: string,): Promise<void> => {
    // messages.actor_id and chat_participants.actor_id both FK to actors.id,
    // and createChat seats createdBy as the owner participant — so the user
    // needs an actor row under their own id before the chat exists.
    const existing = await deps.database
      .selectFrom("actors",)
      .select("id",)
      .where("id", "=", authenticatedUserId,)
      .executeTakeFirst();

    if (!existing) {
      await deps.database
        .insertInto("actors",)
        .values({ id: authenticatedUserId, display_name: "Editor LSP", actor_type: "user", },)
        .execute();
    }

    if (chatId === "") {
      chatId = await createChat(deps.database, { name: "Editor LSP", createdBy: authenticatedUserId, },);
    }

    if (actorId === "") { actorId = authenticatedUserId; }
  };

  const handleInitialize = async (id: unknown, params: Record<string, unknown>,): Promise<void> => {
    const initOptions = params["initializationOptions"];
    const token = typeof initOptions === "object" && initOptions !== null
      ? (initOptions as Record<string, unknown>)["token"]
      : undefined;

    if (typeof token !== "string" || token === "") {
      fail(
        id,
        LSP_ERRORS.requestFailed,
        "initialize requires initializationOptions.token (an llri_ integration token)",
      );

      return;
    }

    const resolved = await verifyIntegrationToken(deps.database, token,);
    if (resolved === null) {
      fail(id, LSP_ERRORS.requestFailed, "unknown, revoked, or expired token",);
      return;
    }

    const issuer = await deps.database
      .selectFrom("users",)
      .select("role",)
      .where("id", "=", resolved.issuerAdminUserId,)
      .executeTakeFirst();

    if (!issuer) {
      fail(id, LSP_ERRORS.requestFailed, "token issuer has no users row",);
      return;
    }

    // Default profile: the first configured one. The isolation gate inside
    // `dispatchHarnessTurn` re-checks the allowlist per turn, so this is a
    // routing default, never an authorization decision.
    if (profile === "") {
      profile = getHarnessAdminFileConfig().profiles[0]?.name ?? "";
    }

    if (profile === "") {
      fail(id, LSP_ERRORS.requestFailed, "no harness profile configured — only admin-configured profiles may run",);
      return;
    }

    userId = resolved.issuerAdminUserId;
    role = issuer.role;
    await ensureBinding(userId,);
    initialized = true;

    respond(id, {
      capabilities: {
        textDocumentSync: TEXT_DOCUMENT_SYNC_FULL,
        completionProvider: { triggerCharacters: [".", ":", "(", " ",], },
      },
      serverInfo: { name: "loop-lore-lsp", version: APP_VERSION, },
    },);
  };

  const handleCompletion = async (id: unknown, params: Record<string, unknown>,): Promise<void> => {
    if (!initialized || userId === null) {
      fail(id, LSP_ERRORS.serverNotInitialized, "server not initialized",);
      return;
    }

    const docParam = params["textDocument"];
    const posParam = params["position"];
    const docRecord = typeof docParam === "object" && docParam !== null ? docParam as Record<string, unknown> : null;
    const posRecord = typeof posParam === "object" && posParam !== null ? posParam as Record<string, unknown> : null;
    const uri = docRecord?.["uri"];
    const line = posRecord?.["line"];
    const character = posRecord?.["character"];

    if (typeof uri !== "string" || typeof line !== "number" || typeof character !== "number") {
      fail(
        id,
        LSP_ERRORS.invalidParams,
        "textDocument/completion requires textDocument.uri and position {line, character}",
      );

      return;
    }

    const doc = docs.get(uri,);
    if (doc === undefined) {
      fail(id, LSP_ERRORS.invalidParams, `unknown document "${uri}" — send textDocument/didOpen first`,);
      return;
    }

    let text: string;
    try {
      text = await debouncedCompletion({ doc, uri, line, character, },);
    } catch (error) {
      fail(id, LSP_ERRORS.requestFailed, `completion dispatch failed: ${(error as Error).message}`,);
      return;
    }

    if (text === "") {
      respond(id, { isIncomplete: false, items: [], },);
      return;
    }

    const firstLine = text.split("\n",)[0] ?? text;
    const label = firstLine.slice(0, 60,);
    respond(id, {
      isIncomplete: false,
      items: [{
        label: label === "" ? "completion" : label,
        kind: COMPLETION_ITEM_KIND_TEXT,
        detail: "loop-lore",
        insertText: text,
      },],
    },);
  };

  return async (text: string,): Promise<void> => {
    const trimmed = text.trim();
    if (trimmed === "") { return; }

    const parsed = safeJsonParse<LspMessage>(trimmed,);
    if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value,)) {
      fail(null, LSP_ERRORS.parse, "parse error",);
      return;
    }

    const message = parsed.value;
    const id = message.id ?? null;
    const hasId = message.id !== undefined;
    const method = typeof message.method === "string" ? message.method : "";
    const params = typeof message.params === "object" && message.params !== null
      ? message.params as Record<string, unknown>
      : {};

    // Notifications carry no id and get no answer.
    switch (method) {
      case "initialize": {
        if (!hasId) { return; }
        await handleInitialize(id, params,);
        return;
      }

      case "initialized":
      case "$/cancelRequest":
      case "$/setTrace": {
        return;
      }

      case "shutdown": {
        shutdownRequested = true;
        if (hasId) { respond(id, null,); }
        return;
      }

      case "exit": {
        onExit(shutdownRequested ? 0 : 1,);
        return;
      }

      case "textDocument/didOpen": {
        const docRecord = params["textDocument"];
        if (typeof docRecord === "object" && docRecord !== null) {
          const record = docRecord as Record<string, unknown>;
          if (typeof record["uri"] === "string" && typeof record["text"] === "string") {
            docs.set(record["uri"], {
              languageId: typeof record["languageId"] === "string" ? record["languageId"] : "plaintext",
              version: typeof record["version"] === "number" ? record["version"] : 0,
              text: record["text"],
            },);
          }
        }

        return;
      }

      case "textDocument/didChange": {
        const docRecord = params["textDocument"];
        const changes = params["contentChanges"];
        const uri = typeof docRecord === "object" && docRecord !== null
          ? (docRecord as Record<string, unknown>)["uri"]
          : undefined;

        if (typeof uri === "string" && Array.isArray(changes,)) {
          // Full sync: clients send the whole document; the last text wins.
          for (const change of changes) {
            if (typeof change !== "object" || change === null) { continue; }
            const changeText = (change as Record<string, unknown>)["text"];
            if (typeof changeText !== "string") { continue; }
            const current = docs.get(uri,) ?? { languageId: "plaintext", version: 0, text: "", };
            const versionRaw = (docRecord as Record<string, unknown>)["version"];
            docs.set(uri, {
              ...current,
              version: typeof versionRaw === "number" ? versionRaw : current.version,
              text: changeText,
            },);
          }
        }

        return;
      }

      case "textDocument/completion": {
        if (!hasId) { return; }
        await handleCompletion(id, params,);
        return;
      }

      default: {
        if (!hasId) { return; }
        fail(id, LSP_ERRORS.methodNotFound, `method not found: ${method === "" ? "(none)" : method}`,);
      }
    }
  };
}

/**
 * Build the Content-Length frame parser for the stdio byte stream: feed it
 * raw stdin chunks, it calls `onMessage` once per complete `Content-Length`
 * frame. Buffer-based so a multibyte character split across chunks survives.
 * @param onMessage - receives each complete frame body as UTF-8 text
 * @returns the chunk feeder for one stdio connection
 */
export function createLspFrameParser(onMessage: (text: string,) => void,): (chunk: Buffer,) => void {
  let pending = Buffer.alloc(0,);

  return (chunk: Buffer,): void => {
    pending = Buffer.concat([pending, chunk,],);

    for (;;) {
      const crlf = pending.indexOf("\r\n\r\n",);
      const lf = pending.indexOf("\n\n",);
      const end = crlf !== -1 && (lf === -1 || crlf < lf) ? crlf + 4 : lf !== -1 ? lf + 2 : -1;
      if (end === -1) { return; }

      const header = pending.subarray(0, end,).toString("latin1",);
      const match = /content-length:\s*(\d+)/i.exec(header,);
      pending = pending.subarray(end,);
      if (!match?.[1]) { continue; }

      const length = Number(match[1],);
      if (pending.length < length) {
        // Body incomplete — put the ASCII header back and wait for more.
        pending = Buffer.concat([Buffer.from(header, "latin1",), pending,],);
        return;
      }

      onMessage(pending.subarray(0, length,).toString("utf8",),);
      pending = pending.subarray(length,);
    }
  };
}

/**
 * Production entrypoint: load config, open the database, serve LSP over
 * stdio with Content-Length framing. Exits 1 with a stderr diagnostic when
 * the harness runtime is disabled — and NEVER serves completions
 * unauthenticated (every `initialize` needs a token).
 */
export async function main(): Promise<void> {
  createLogger();
  const config: Config = loadConfig();
  const harnessAcp = config.harness?.acp ?? { enabled: false, profiles: [], };
  initHarnessAdminSettings(harnessAcp,);
  initHarnessRuntime(harnessAcp,);

  const database = getDatabase();
  await applyStoredHarnessSettings(database,);

  const runtime = getHarnessRuntime();
  const logger = getLogger();
  if (runtime === null) {
    logger.warn(
      "inbound LSP stdio server refused to start: harness.acp is disabled or unconfigured",
      { module: "lsp-inbound", },
    );

    process.exitCode = 1;
    return;
  }

  const write = (message: unknown,): void => {
    const serialized = safeJsonStringify(message,);
    if (!serialized.ok) { return; }
    const length = Buffer.byteLength(serialized.value,);
    process.stdout.write(`Content-Length: ${length}\r\n\r\n${serialized.value}`,);
  };

  const handler = createLspMessageHandler({ database, runtime, }, write,);
  const feed = createLspFrameParser((text,) => {
    void handler(text,);
  },);

  process.stdin.on("data", feed,);
  // A close without the `exit` notification is abnormal — `exit` already
  // ends the process first on the clean path.
  process.stdin.on("end", () => {
    process.exit(1,);
  },);

  logger.info("inbound LSP stdio server ready", { module: "lsp-inbound", },);
}

if (import.meta.main) {
  void main();
}
