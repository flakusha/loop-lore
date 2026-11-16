// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * inbound editor-LSP message handler — initialize/shutdown,
 * didOpen/didChange tracking, single-item `textDocument/completion`.
 *
 * The completion path is a READ-ONLY `dispatchHarnessTurn` call (see
 * prompt.ts): the prompt carries an explicit read-only directive, so the
 * harness permission queue stays on auto-allow and write/exec asks park. The
 * turn itself is audited exactly like every other harness turn. Auth:
 * `initialize` params' `initializationOptions.token` resolves through the
 * existing integration-token seam to the issuing admin's userId.
 *
 * Seams live beside this file: protocol.ts (framing + errors), prompt.ts
 * (completion prompt), documents.ts (open-doc sync), completion.ts
 * (debounced dispatch + binding). stdio-server.ts owns production wiring.
 */

import type { Kysely, } from "kysely";
import { APP_VERSION, } from "../../config/constants";
import type { DB, } from "../../db/schema";
import { verifyIntegrationToken, } from "../../middleware/auth/integration-token";
import { safeJsonParse, } from "../../utils";
import { getHarnessAdminFileConfig, } from "../harness/admin-settings";
import type {
  DispatchHarnessTurnOptions,
  DispatchHarnessTurnOutcome,
} from "../harness/dispatch";
import type { HarnessRuntime, } from "../harness/runtime";
import { type CompletionBinding, createCompletionDispatcher, } from "./completion";
import { type OpenDoc, trackDidChange, trackDidOpen, } from "./documents";
import { LSP_ERRORS, type LspMessage, } from "./protocol";

/** `TextDocumentSyncKind.Full` — clients send the whole document on change. */
const TEXT_DOCUMENT_SYNC_FULL = 1;

/** `CompletionItemKind.Text` — the only kind this slice returns. */
const COMPLETION_ITEM_KIND_TEXT = 1;

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
  const onExit = deps.onExit ?? ((): void => {/* no exit sink outside production */});

  const docs = new Map<string, OpenDoc>();
  const binding: CompletionBinding = {
    database: deps.database,
    runtime: deps.runtime,
    role: null,
    userId: null,
    profile: deps.profile ?? "",
    chatId: deps.chatId ?? "",
    actorId: deps.actorId ?? "",
    dispatchTurn: deps.dispatchTurn,
    debounceMs: deps.debounceMs,
  };

  const completion = createCompletionDispatcher(binding,);
  let initialized = false;
  let shutdownRequested = false;

  const respond = (id: unknown, result: unknown,): void => {
    write({ jsonrpc: "2.0", id: id ?? null, result, },);
  };

  const fail = (id: unknown, code: number, message: string,): void => {
    write({ jsonrpc: "2.0", id: id ?? null, error: { code, message, }, },);
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
    if (binding.profile === "") {
      binding.profile = getHarnessAdminFileConfig().profiles[0]?.name ?? "";
    }

    if (binding.profile === "") {
      fail(id, LSP_ERRORS.requestFailed, "no harness profile configured — only admin-configured profiles may run",);
      return;
    }

    binding.userId = resolved.issuerAdminUserId;
    binding.role = issuer.role;
    await completion.ensureBinding(binding.userId,);
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
    if (!initialized || binding.userId === null) {
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
      text = await completion.requestCompletion({ doc, uri, line, character, },);
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
        trackDidOpen(docs, params,);
        return;
      }

      case "textDocument/didChange": {
        trackDidChange(docs, params,);
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
