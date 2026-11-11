// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * inbound ACP studio server — agent side (epic-agentic-integration-mcp-acp
 * §3.3: ACP v1, stdio NDJSON; "sessions map onto the EXISTING chats /
 * generation model").
 *
 * loop-lore plays the AGENT role an ACP client (the Studio contract) drives:
 * initialize → session/new → session/prompt, with the reply delivered as
 * `session/update` agent_message_chunk notifications before the prompt
 * response. Wire facts mirror the OUTBOUND client's vendored protocol
 * (`src/integrations/harness/adapter-types.ts`): newline-delimited JSON-RPC
 * 2.0 over stdio, protocolVersion 1.
 *
 * CASE-INSENSITIVE PARITY: every method is dispatched on its lowercased
 * name, so "Initialize"/"SESSION/PROMPT"-style callers meet the same
 * behavior as canonical lowercase clients (the §3.3 Studio cover).
 *
 * Every prompt routes through the facade op registry (`chat.send`) with the
 * server-resolved inbound principal — the RPC body is protocol payload only
 * and can never assert an identity; a refused op (401/403/429-class) maps
 * to a JSON-RPC error, never a fabricated success. Sessions are in-memory
 * (stdio lifetime); a prompt for an unknown session is a -32002 error.
 */

import { APP_VERSION, } from "../../config/constants";
import { safeJsonParse, safeJsonStringify, } from "../../utils";
import { runFacadeOp, } from "../loop-lore-facade/registry";
import type { FacadeRegistry, } from "../loop-lore-facade/registry";
import type { FacadeContext, } from "../loop-lore-facade/types";

/** ACP protocol version this server answers (pinned v1; v2 out of scope). */
export const ACP_PROTOCOL_VERSION = 1;

/** JSON-RPC error codes this server answers with. */
export const ACP_ERRORS = {
  parse: -32700,
  methodNotFound: -32601,
  invalidParams: -32602,
  serverError: -32000,
  unknownSession: -32002,
} as const;

/** Deps one agent connection needs. */
export interface AcpAgentDeps {
  /** The facade op registry (single source of tools/prompts). */
  registry: FacadeRegistry;
  /** The server-resolved inbound principal's facade context. */
  ctx: FacadeContext;
  /** Sink for every JSON-RPC message this server emits (stdio NDJSON). */
  write: (message: unknown,) => void;
}

/** One live ACP session: the loop-lore chat it maps onto. */
interface AcpSession {
  chatId: string;
}

/** A JSON-RPC request carrying a method (notification when id absent). */
interface JsonRpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
}

/** Prompt content block the Studio contract sends (text subset). */
interface PromptBlock {
  type?: string;
  text?: string;
}

/**
 * Extract the reply text a `chat.send` result carries. The pipeline answers
 * `replied: true` with a generation envelope (shape varies by provider) and
 * `replied: false` with `{ id, context }`; anything unrecognizable falls
 * back to the serialized JSON so the client still sees the outcome.
 * @param json - the op result body
 * @returns {string} the best-effort reply text
 */
export function extractReplyText(json: unknown,): string {
  if (typeof json === "object" && json !== null) {
    const record = json as Record<string, unknown>;
    for (const key of ["reply", "text", "message",] as const) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) { return value; }
    }
  }

  const serialized = safeJsonStringify(json ?? null,);
  return serialized.ok ? serialized.value : "null";
}

/**
 * Build the per-connection line handler. Feed it every NDJSON line the
 * client writes; responses/notifications come back through `deps.write`.
 * @param deps - registry, principal context, and the write sink
 * @returns {(line: string) => Promise<void>} the line handler
 */
export function createAcpAgentHandler(deps: AcpAgentDeps,): (line: string,) => Promise<void> {
  const sessions = new Map<string, AcpSession>();

  const send = (message: unknown,): void => {
    deps.write(message,);
  };

  const respond = (id: number | string | null, result: unknown,): void => {
    send({ jsonrpc: "2.0", id, result, },);
  };

  const fail = (
    id: number | string | null,
    code: number,
    message: string,
    data?: unknown,
  ): void => {
    send({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data, }), }, },);
  };

  return async (line: string,) => {
    const trimmed = line.trim();
    if (trimmed === "") { return; }

    const parsed = safeJsonParse<JsonRpcRequest>(trimmed,);
    if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) {
      // A line we cannot parse: answer a parse error only when it plausibly
      // carried an id (batch clients hang on silence for requests).
      fail(null, ACP_ERRORS.parse, "parse error",);
      return;
    }

    const request = parsed.value;
    const id = request.id ?? null;
    const method = typeof request.method === "string" ? request.method.toLowerCase() : "";
    const params = (request.params ?? {}) as Record<string, unknown>;

    switch (method) {
      case "initialize": {
        respond(id, {
          protocolVersion: ACP_PROTOCOL_VERSION,
          agentInfo: { name: "loop-lore", version: APP_VERSION, title: "Loop Lore", },
          authMethods: [],
        },);

        return;
      }

      case "session/new": {
        // Session → chat binding: the client names the loop-lore chat in
        // `loopLoreChatId` (or plain `chatId`). A missing/empty id is an
        // invalid-params error — a session with no chat cannot prompt.
        const chatId = typeof params.loopLoreChatId === "string"
          ? params.loopLoreChatId
          : typeof params.chatId === "string"
          ? params.chatId
          : "";

        if (chatId === "") {
          fail(id, ACP_ERRORS.invalidParams, "session/new requires loopLoreChatId (the loop-lore chat to bind)",);
          return;
        }

        const sessionId = `acp-${crypto.randomUUID()}`;
        sessions.set(sessionId, { chatId, },);
        respond(id, { sessionId, },);
        return;
      }

      case "session/prompt": {
        const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
        const session = sessions.get(sessionId,);
        if (session === undefined) {
          fail(id, ACP_ERRORS.unknownSession, `unknown session "${sessionId}"`,);
          return;
        }

        const prompt = Array.isArray(params.prompt,) ? params.prompt as PromptBlock[] : [];
        const content = prompt
          .filter((block,) => typeof block?.text === "string")
          .map((block,) => block.text)
          .join("\n",);

        if (content.length === 0) {
          fail(id, ACP_ERRORS.invalidParams, "session/prompt requires at least one text content block",);
          return;
        }

        const result = await runFacadeOp(deps.registry, deps.ctx, "chat.send", {
          chatId: session.chatId,
          content,
        },);

        if (!result.ok) {
          fail(id, ACP_ERRORS.serverError, `facade op "chat.send" failed with status ${result.status}`, result.json,);
          return;
        }

        const text = extractReplyText(result.json,);
        send({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId,
            update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text, }, },
          },
        },);

        respond(id, { stopReason: "end_turn", },);
        return;
      }

      case "session/cancel": {
        // Fire-and-forget per ACP: acknowledged with an empty result when a
        // response id was supplied (the outbound client omits it).
        if (request.id !== undefined) { respond(id, {},); }
        return;
      }

      default: {
        if (request.id === undefined) { return; } // notification: ignore silently
        fail(id, ACP_ERRORS.methodNotFound, `method not found: ${request.method ?? "(none)"}`,);
      }
    }
  };
}
