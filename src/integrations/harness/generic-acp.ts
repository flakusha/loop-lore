// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness-agnostic ACP adapter engine: the shared ACP wire surface —
 * initialize → session/new → session/prompt with `agent_message_chunk`
 * collection, model switching via `session/set_config_option` — implemented
 * exactly once. Each harness file subclasses {@link GenericAcpAdapter} and
 * supplies only its wire mapping: the model config-option id, optional
 * model-id translation, and an optional quota surface. Wire facts (vendored
 * ACP protocol, newline-delimited JSON-RPC 2.0 over stdio) are documented in
 * adapter-types.ts.
 */

import {
  type HarnessAcpAdapter,
  HarnessAcpError,
  type HarnessAdapterCommandOptions,
  type HarnessTurnResult,
  type HarnessUsageReport,
  type PendingPermission,
  type PermissionOutcome,
} from "./adapter-types";
import { JsonRpcProcess, JsonRpcRequestError, } from "./jsonrpc-process";

/** ACP protocol version the adapter speaks. */
const PROTOCOL_VERSION = 1;

/**
 * Options shared by every generic-ACP harness adapter: the spawn command
 * plus the per-connection knobs declared on {@link HarnessAdapterCommandOptions}.
 */
export interface GenericAcpOptions extends HarnessAdapterCommandOptions {
  /** Spawn argv for the harness's ACP server. */
  command: string[];
}

/** Map a transport error to the adapter's typed error. */
function toAcpError(kind: HarnessAcpError["kind"], error: unknown,): HarnessAcpError {
  if (error instanceof HarnessAcpError) { return error; }
  if (error instanceof JsonRpcRequestError) {
    return new HarnessAcpError(kind, error.message, { cause: error, },);
  }

  return new HarnessAcpError(kind, (error as Error).message ?? "unknown", { cause: error, },);
}

/** Raw usage object from a prompt response. */
interface RawUsage {
  inputTokens?: unknown;
  outputTokens?: unknown;
  totalTokens?: unknown;
}

/** A session/update notification payload and its text content block. */
interface SessionUpdateParams {
  update?: { sessionUpdate?: unknown; content?: { type: string; text?: string } | null };
}

/**
 * One live ACP connection to a harness profile. All methods may reject with
 * {@link HarnessAcpError}; the caller records the failure with its breaker.
 */
export abstract class GenericAcpAdapter implements HarnessAcpAdapter {
  /** Config option id this harness uses for its model select. */
  protected abstract readonly modelConfigId: string;

  /** Transport; null before the lazy handshake and after close(). */
  protected rpc: JsonRpcProcess | null = null;

  private session: { sessionId: string; options: unknown } | null = null;
  private readonly opts: GenericAcpOptions;
  /** agent_message_chunk text accumulated during the in-flight prompt. */
  private chunks: string[] = [];
  /** Open server-originated permission request, when one awaits an outcome. */
  private permission: {
    pending: PendingPermission;
    respond: (result: unknown,) => void;
  } | null = null;
  /** Resolves once the in-flight prompt request has been written to the wire; `cancel` orders on it. */
  private promptDispatched: Promise<void> = Promise.resolve();

  /**
   * @param options - spawn argv + cwd; the handshake is lazy (typed probe failure).
   */
  protected constructor(options: GenericAcpOptions,) {
    this.opts = options;
  }

  /**
   * Wire model value → core-facing `provider/id` id. Default: verbatim.
   * @param wireModelId - advertised session/new option value
   */
  protected toCoreModelId(wireModelId: string,): string {
    return wireModelId;
  }

  /**
   * Core-facing model id → wire value, inverse of {@link toCoreModelId}.
   * @param modelId - core-facing model id, as enumerateModels returned it
   */
  protected toWireModelId(modelId: string,): string {
    return modelId;
  }

  /**
   * Quota reports when this harness publishes them; failures are swallowed
   * by fetchUsageReports (an absent or broken surface is normal, not fatal).
   */
  protected async fetchQuotaReports(): Promise<HarnessUsageReport[] | null> {
    return null;
  }

  /**
   * Enumerate the advertised model list.
   * @returns core-facing model ids from the session's advertised models.
   * @throws {HarnessAcpError} kind `spawn`/`initialize`/`session` on failure
   */
  async enumerateModels(): Promise<string[]> {
    return this.advertisedModelIds(await this.ensureSession(),)
      .filter((v,) => v.length > 0)
      .map((v,) => this.toCoreModelId(v,));
  }

  /**
   * Advertised wire model values for the established session. Default: the
   * select configOption named by modelConfigId (stable ACP v1). Override for
   * non-standard surfaces — claude-agent-acp instead returns a `models`
   * session field (SessionModelState.availableModels[].modelId), which is
   * not a configOption at all.
   * @param session - established session state (id + session/new response)
   * @returns raw wire model values, unfiltered.
   */
  protected advertisedModelIds(session: { sessionId: string; options: unknown },): string[] {
    const select = ((session.options as { configOptions?: unknown } | null)?.configOptions as
      | Array<{ id?: unknown; options?: Array<{ value?: unknown }> }>
      | null)
      ?.find((o,) => o.id === this.modelConfigId);

    return (select?.options ?? []).map((o,) => String(o.value ?? "",));
  }

  /**
   * Switch the session model via session/set_config_option.
   * @throws {HarnessAcpError} kind `model` when the harness rejects the id
   */
  async setModel(modelId: string,): Promise<void> {
    try {
      const sessionId = (await this.ensureSession()).sessionId;
      await this.applySessionModel(sessionId, this.toWireModelId(modelId,),);
    } catch (error) {
      throw toAcpError("model", error,);
    }
  }

  /**
   * Apply a wire model value to the session. Default: session/set_config_option
   * (stable ACP v1). Override for extension methods — claude-agent-acp
   * switches via its `unstable_setSessionModel` ({sessionId, modelId})
   * extension instead.
   * @param sessionId - established session id
   * @param wireModelId - the translated wire model value
   * @throws {JsonRpcRequestError} when the harness rejects the call
   */
  protected async applySessionModel(sessionId: string, wireModelId: string,): Promise<void> {
    await this.rpc!.request("session/set_config_option", {
      sessionId,
      configId: this.modelConfigId,
      value: wireModelId,
    },);
  }

  /**
   * Run one prompt turn and collect the response.
   * @throws {HarnessAcpError} kind `prompt` on failure
   */
  async prompt(prompt: string,): Promise<HarnessTurnResult> {
    const dispatched = Promise.withResolvers<void>();
    this.promptDispatched = dispatched.promise;
    try {
      const sessionId = (await this.ensureSession()).sessionId;
      this.chunks = [];
      const requestPromise = this.rpc!.request("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: prompt, },],
      },);

      dispatched.resolve();
      const response = await requestPromise as { stopReason?: unknown; usage?: RawUsage | null };

      return {
        text: this.chunks.join("",),
        stopReason: typeof response.stopReason === "string" ? response.stopReason : "unknown",
        usage: this.toUsage(response.usage,),
        acpSessionId: sessionId,
      };
    } catch (error) {
      dispatched.resolve();
      throw toAcpError("prompt", error,);
    }
  }

  /**
   * Cancel the in-flight prompt turn via the `session/cancel` notification.
   * @throws {HarnessAcpError} kind `session` when no live session exists
   */
  async cancel(): Promise<void> {
    if (!this.rpc || !this.session) {
      throw new HarnessAcpError("session", "no live ACP session to cancel",);
    }

    await this.promptDispatched;
    this.rpc.notify("session/cancel", { sessionId: this.session.sessionId, },);
  }

  /** The open server-originated permission request, when one awaits an outcome. */
  pendingPermission(): PendingPermission | null {
    return this.permission?.pending ?? null;
  }

  /**
   * Answer the open permission request.
   * @param outcome - the client's choice among the harness's options
   * @throws {HarnessAcpError} kind `session` when nothing is pending
   */
  respondPermission(outcome: PermissionOutcome,): void {
    const open = this.permission;
    if (!open) {
      throw new HarnessAcpError("session", "no pending permission request",);
    }

    this.permission = null;
    open.respond({ outcome, },);
  }

  /**
   * Quota reports, when the harness publishes them.
   * @returns normalized reports, or null when the harness has no quota surface.
   */
  async fetchUsageReports(): Promise<HarnessUsageReport[] | null> {
    try {
      await this.ensureSession();
      return await this.fetchQuotaReports();
    } catch {
      return null; // No quota surface is a normal condition, not a failure.
    }
  }

  /** Terminate the underlying process. Idempotent. */
  close(): void {
    this.rpc?.close();
    this.dropTransportState();
  }

  /**
   * Forget the transport and memoized session, withdrawing any parked
   * permission ask. Shared by close() and the child-exit path so a dying
   * child and a deliberate close behave identically.
   */
  private dropTransportState(): void {
    this.rpc = null;
    this.session = null;
    const parked = this.permission !== null;
    this.permission = null;
    if (parked) { this.opts.onPermissionWithdrawn?.(); }
  }

  /**
   * Ensure the process is spawned and the session established.
   * @returns sessionId plus the session/new response (for configOptions).
   * @throws {HarnessAcpError} on spawn/initialize/session failure
   */
  private async ensureSession(): Promise<{ sessionId: string; options: unknown }> {
    if (this.session) { return this.session; }

    this.rpc = new JsonRpcProcess({
      command: this.opts.command,
      cwd: this.opts.cwd,
      requestTimeoutMs: this.opts.requestTimeoutMs,
      onExit: () => {
        // Zombie-session gap: a child dying mid-session must not leave the
        // memoized session bound to a dead transport — the next adapter call
        // respawns a fresh child and session instead of surfacing
        // "connection closed" forever.
        this.dropTransportState();
      },
      onRequest: (method, params,) => this.handleServerRequest(method, params,),
      onNotification: (method, params,) => {
        if (method !== "session/update") { return; }
        const p = params as SessionUpdateParams;
        const update = p?.update;
        if (update?.sessionUpdate !== "agent_message_chunk") { return; }
        const content = update.content;
        if (content?.type === "text" && typeof content.text === "string") {
          this.chunks.push(content.text,);
        }
      },
    },);

    try {
      await this.rpc.request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: "loop-lore", version: "1", },
      },);

      const session = await this.rpc.request("session/new", { cwd: this.opts.cwd ?? process.cwd(), },) as {
        sessionId?: unknown;
      };

      if (typeof session.sessionId !== "string" || session.sessionId === "") {
        throw new HarnessAcpError("session", "session/new returned no sessionId",);
      }

      this.session = { sessionId: session.sessionId as string, options: session, };
      return this.session;
    } catch (error) {
      const kind = error instanceof JsonRpcRequestError &&
          (error.message.includes("spawn",) || error.message.includes("Executable not found",))
        ? "spawn"
        : error instanceof HarnessAcpError
        ? error.kind
        : "initialize";

      this.close();
      throw toAcpError(kind, error,);
    }
  }

  /**
   * Serve one server-originated request: permission asks park on the engine
   * until `respondPermission`, fs-read asks go through the injected reader,
   * anything else answers unsupported. The permission slot stays SINGLE per
   * connection on purpose (harnesses serialize asks; a concurrent ask is
   * refused `-32601`) — multiplexing across profiles is the runtime queue's
   * job, not this engine's.
   * @param method - wire method the harness invoked
   * @param params - raw request params
   * @returns the response result payload.
   */
  private handleServerRequest(method: string, params: unknown,): Promise<unknown> {
    if (method === "session/request_permission") {
      const p = params as { kind?: unknown } | null;
      if (this.permission) {
        return Promise.reject(new JsonRpcRequestError("permission request already pending", -32601,),);
      }

      return new Promise<unknown>((resolve,) => {
        const pending: PendingPermission = {
          params,
          kind: typeof p?.kind === "string" ? p.kind : null,
        };

        this.permission = { pending, respond: resolve, };
        this.opts.onPermissionRequest?.(pending,);
      },);
    }

    if (method === "fs/read_text_file") {
      const reader = this.opts.readTextFile;
      if (!reader) {
        return Promise.reject(new JsonRpcRequestError(`unsupported server request: ${method}`, -32601,),);
      }

      const path = (params as { path?: unknown } | null)?.path;
      return typeof path === "string"
        ? reader(path,).then((content,) => ({ content, }))
        : Promise.reject(new JsonRpcRequestError("fs/read_text_file missing path", -32602,),);
    }

    return Promise.reject(new JsonRpcRequestError(`unsupported server request: ${method}`, -32601,),);
  }

  /**
   * Normalize the wire usage object.
   * @param usage - raw usage from the prompt response
   * @returns usage, or null when unusable.
   */
  private toUsage(usage: RawUsage | null | undefined,): HarnessTurnResult["usage"] {
    if (!usage) { return null; }
    const num = (v: unknown,): number => (typeof v === "number" && Number.isFinite(v,) ? v : 0);
    return {
      inputTokens: num(usage.inputTokens,),
      outputTokens: num(usage.outputTokens,),
      totalTokens: num(usage.totalTokens,),
    };
  }
}
