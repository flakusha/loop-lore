// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 310
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
import type { Config, } from "../../config/schema";
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
  /** Optional human responder for an `elicitation/create` ask. */
  elicit?: (request: AcpElicitationRequest,) => Promise<AcpElicitationAnswer>;
}

/** Typed `elicitation/create` ask the Studio client sends to this agent. */
export interface AcpElicitationRequest {
  sessionId: string;
  message: string;
  mode?: string;
}

/** Typed answer to an elicitation ask (`action` is the ACP wire field). */
export interface AcpElicitationAnswer {
  action: "accept" | "decline" | "cancel";
}

/** Hard bounds on the optional per-session fields. */
const MAX_SESSION_DIRECTORIES = 32;
const MAX_REPLAY_MESSAGES = 20;
const MAX_ELICITATION_MESSAGE_CHARS = 2000;

/** Model config ids both ACP dialects use (omp uppercase, others lowercase). */
const MODEL_CONFIG_IDS = ["model", "MODEL_CONFIG_ID",] as const;

/** One live ACP session: the loop-lore chat it maps onto. */
interface AcpSession {
  chatId: string;
  cwd: string | null;
  additionalDirectories: string[];
  modeId: string | null;
  modelId: string | null;
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

  // Ponytail: configured LLM providers define the allowed model values.
  // chat.send has no model override yet, so the selection is session state
  // (readable via session/list), not a generation override.
  const allowedModelIds = [
    ...new Set(deps.ctx.config.generation.providers.openaiCompatible
      .flatMap((provider,) => [provider.model, ...Object.keys(provider.models ?? {},),]),),
  ];

  const configOptionsFor = (modelId: string | null,) =>
    allowedModelIds.length === 0 ? [] : [{
      id: "model",
      name: "Model",
      type: "select" as const,
      currentValue: modelId ?? allowedModelIds[0] ?? "",
      options: allowedModelIds.map((value,) => ({ value, name: value, })),
    },];

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
        const cwd = typeof params.cwd === "string" && params.cwd !== "" ? params.cwd : null;
        const additionalDirectories = Array.isArray(params.additionalDirectories,)
          ? params.additionalDirectories
            .filter((entry,): entry is string => typeof entry === "string" && entry !== "")
            .slice(0, MAX_SESSION_DIRECTORIES,)
          : [];

        sessions.set(sessionId, { chatId, cwd, additionalDirectories, modeId: null, modelId: null, },);
        respond(id, { sessionId, configOptions: configOptionsFor(null,), },);
        return;
      }

      case "session/list": {
        respond(id, {
          sessions: [...sessions.entries(),].map(([sessionId, session,],) => ({
            sessionId,
            cwd: session.cwd,
            additionalDirectories: session.additionalDirectories,
            modeId: session.modeId,
            modelId: session.modelId,
          })),
        },);

        return;
      }

      case "session/resume": {
        const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
        const session = sessions.get(sessionId,);
        if (session === undefined) {
          fail(id, ACP_ERRORS.unknownSession, `unknown session "${sessionId}"`,);
          return;
        }

        // Re-attach without replay: the next prompt continues the same chat.
        respond(id, { sessionId, cwd: session.cwd, },);
        return;
      }

      case "session/load": {
        const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
        const session = sessions.get(sessionId,);
        if (session === undefined) {
          fail(id, ACP_ERRORS.unknownSession, `unknown session "${sessionId}"`,);
          return;
        }

        // Replay reuses the same facade op as the HTTP history surface, so
        // authorization and enrichment stay identical. The page size is the
        // bound — a client cannot ask this agent to stream its whole log.
        const history = await runFacadeOp(deps.registry, deps.ctx, "chat.history", {
          chatId: session.chatId,
          page: 1,
          pageSize: MAX_REPLAY_MESSAGES,
        },);

        if (!history.ok) {
          fail(
            id,
            ACP_ERRORS.serverError,
            `facade op "chat.history" failed with status ${history.status}`,
            history.json,
          );

          return;
        }

        const data = (history.json as { data?: unknown[] } | null)?.data ?? [];
        for (const row of data.slice(0, MAX_REPLAY_MESSAGES,)) {
          const text = typeof row === "object" && row !== null
            ? (row as Record<string, unknown>).content
            : undefined;

          if (typeof text !== "string" || text.length === 0) { continue; }

          send({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId,
              update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text, }, },
            },
          },);
        }

        respond(id, { sessionId, },);
        return;
      }

      case "session/set_mode":
      case "set_mode": {
        const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
        const session = sessions.get(sessionId,);
        if (session === undefined) {
          fail(id, ACP_ERRORS.unknownSession, `unknown session "${sessionId}"`,);
          return;
        }

        const modeId = typeof params.modeId === "string" ? params.modeId : "";
        if (modeId === "") {
          fail(id, ACP_ERRORS.invalidParams, "session/set_mode requires a modeId",);
          return;
        }

        session.modeId = modeId;
        respond(id, { currentModeId: modeId, },);
        return;
      }

      case "session/set_config_option": {
        const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
        const session = sessions.get(sessionId,);
        if (session === undefined) {
          fail(id, ACP_ERRORS.unknownSession, `unknown session "${sessionId}"`,);
          return;
        }

        const configId = typeof params.configId === "string" ? params.configId : "";
        const value = typeof params.value === "string" ? params.value : "";
        if (!(MODEL_CONFIG_IDS as readonly string[]).includes(configId,) || !allowedModelIds.includes(value,)) {
          fail(id, ACP_ERRORS.invalidParams, `unsupported config option "${configId}" value "${value}"`, {
            allowedConfigIds: MODEL_CONFIG_IDS,
            allowedValues: allowedModelIds,
          },);

          return;
        }

        session.modelId = value;
        respond(id, { configOptions: configOptionsFor(value,), },);
        return;
      }

      case "elicitation/create": {
        const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
        if (!sessions.has(sessionId,)) {
          fail(id, ACP_ERRORS.unknownSession, `unknown session "${sessionId}"`,);
          return;
        }

        const message = typeof params.message === "string"
          ? params.message.slice(0, MAX_ELICITATION_MESSAGE_CHARS,)
          : "";

        if (message === "") {
          fail(id, ACP_ERRORS.invalidParams, "elicitation/create requires a message",);
          return;
        }

        // ponytail: stdio has no composed human-decision channel. The optional
        // hook lets a caller supply one; without it the agent fails closed
        // with "decline" instead of inventing a user answer. Upgrade path:
        // compose the Studio elicitation UI into `elicit`.
        const answer: AcpElicitationAnswer = deps.elicit
          ? await deps.elicit({
            sessionId,
            message,
            ...(typeof params.mode === "string" ? { mode: params.mode, } : {}),
          },)
          : { action: "decline", };

        respond(id, answer,);
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
