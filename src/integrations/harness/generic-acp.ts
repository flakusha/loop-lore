// SPDX-License-Identifier: LGPL-3.0-or-later
// size-allow: 330
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

import { getChildLogger, } from "../../logger";
import { narrowSessionUpdate, } from "./acp-session-update";
import {
  type HarnessAcpAdapter,
  HarnessAcpError,
  type HarnessAdapterCommandOptions,
  type HarnessQuotaSurface,
  type HarnessTurnResult,
  type HarnessUsageReport,
  type PendingPermission,
  PermissionAskGoneError,
  PermissionDecisionRefusedError,
  type PermissionOutcome,
} from "./adapter-types";
import { JsonRpcProcess, JsonRpcRequestError, } from "./jsonrpc-process";
import { advertisedPermissionOptions, answerCarriesDecision, wirePermissionOutcome, } from "./permission-outcome";
import { TurnTranscriptCollector, } from "./turn-transcript";

/** ACP protocol version the adapter speaks. */
const PROTOCOL_VERSION = 1;

/** Logger; null-safe — the adapter must work before logger init. */
const log = (): ReturnType<typeof getChildLogger> => getChildLogger("harness-acp",);

/**
 * How long a turn waits for a `usage_update` the harness sends AFTER the
 * prompt response. The cost rides a SESSION notification, so the response can
 * overtake it; the wait is bounded and only runs when the harness has shown
 * it reports costs (or has not been probed yet).
 */
const USAGE_DRAIN_MS = 250;

/**
 * Apply the ACP `fs/read_text_file` range to the text the reader returned.
 * The request shape (vendored v1 schema, `ReadTextFileRequest`): `line` is the
 * 1-based line to start reading from, `limit` the maximum number of lines to
 * read; both nullable.
 * @param text - the file's text
 * @param line - the first line the request asked for
 * @param limit - the maximum number of lines the request asked for
 * @returns the requested slice.
 */
function sliceRequestedLines(text: string, line: unknown, limit: unknown,): string {
  const first = typeof line === "number" && Number.isInteger(line,) && line > 0 ? line - 1 : 0;
  const max = typeof limit === "number" && Number.isInteger(limit,) && limit >= 0 ? limit : null;
  if (first === 0 && max === null) { return text; }

  const lines = text.split("\n",);
  return lines.slice(first, max === null ? lines.length : first + max,).join("\n",);
}

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
  /** Everything the in-flight prompt streamed (text, reasoning, tool calls). */
  private transcript = new TurnTranscriptCollector();
  /** The session's latest REPORTED cost (usage_update); null when none was reported. */
  private sessionCostUsd: number | null = null;
  /** The cost reported DURING the in-flight turn; null when it reported none. */
  private turnCostUsd: number | null = null;
  /** What the session's usage reports say about the harness's cost reporting. */
  private usageState: "unknown" | "costing" | "costless" = "unknown";
  /** Resolver parked on the next usage notification of this session. */
  private usageWaiter: (() => void) | null = null;
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
   * ACP flavors have no requestable quota method (see HARNESS_QUOTA_SURFACES),
   * so the generic engine declares "none"; only omp's ext method overrides.
   */
  readonly quotaSurface: HarnessQuotaSurface = "none";

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
      this.transcript = new TurnTranscriptCollector();
      this.turnCostUsd = null;
      const requestPromise = this.rpc!.request("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: prompt, },],
      },);

      dispatched.resolve();
      const response = await requestPromise as { stopReason?: unknown; usage?: RawUsage | null };

      // The harness may report the cost AFTER the response (the ACP cost
      // rides a session notification, not the PromptResponse), so the turn
      // waits - bounded - for that report instead of dropping it. The wait
      // runs only while the harness may still report one: a harness that
      // reported a cost keeps being waited for, one that was probed and never
      // reported a cost is not waited for again.
      if (this.turnCostUsd === null && this.usageState !== "costless") {
        await this.drainUsage();
        if (this.usageState === "unknown") { this.usageState = "costless"; }
      }

      const transcript = this.transcript.snapshot();
      return {
        text: transcript.text,
        stopReason: typeof response.stopReason === "string" ? response.stopReason : "unknown",
        usage: this.toUsage(response.usage,),
        costUsd: this.sessionCostUsd,
        acpSessionId: sessionId,
        transcript,
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

    // A cancelled turn MUST answer every pending permission ask with the
    // protocol's cancelled outcome (vendored v1 schema, `RequestPermissionOutcome`).
    const open = this.permission;
    if (open) {
      this.permission = null;
      open.respond({ outcome: { outcome: "cancelled", }, },);
      this.opts.onPermissionWithdrawn?.();
    }
  }

  /** The open server-originated permission request, when one awaits an outcome. */
  pendingPermission(): PendingPermission | null {
    return this.permission?.pending ?? null;
  }

  /**
   * Answer the open permission request with the protocol's answer shape: the
   * option the decision rides, named by the id the harness advertised
   * (`RequestPermissionOutcome`, vendored ACP v1 schema). A decision no
   * advertised option can carry is refused SPEC-LEGALLY — the harness's own
   * rejection option, or the protocol's `cancelled` outcome — never a
   * JSON-RPC error the agent would have to interpret as a failed request.
   * @param outcome - the client's choice among the harness's options
   * @throws {PermissionAskGoneError} when nothing is pending
   * @throws {PermissionDecisionRefusedError} when the harness could not
   *   express the decision and refused the tool call instead
   */
  respondPermission(outcome: PermissionOutcome,): void {
    const open = this.permission;
    if (!open) {
      throw new PermissionAskGoneError();
    }

    this.permission = null;
    const options = advertisedPermissionOptions(open.pending.params,);
    const answer = wirePermissionOutcome(outcome, options,);
    open.respond({ outcome: answer, },);
    if (!answerCarriesDecision(answer, outcome, options,)) {
      // The harness could not express the decision: the wire carries a
      // refusal, so the decision did not take effect.
      throw new PermissionDecisionRefusedError();
    }
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
        const foreign = this.foreignSessionId(params,);
        if (foreign !== null) {
          log()?.warn("harness session update for another session ignored", { sessionId: foreign, },);
          return;
        }

        for (const event of narrowSessionUpdate(params,)) {
          if (event.type === "usage") {
            // A cost-less update never clears a reported cost: the session
            // keeps the latest cost the harness REPORTED, and null means the
            // harness never reported one.
            if (event.costUsd !== null) {
              this.sessionCostUsd = event.costUsd;
              this.turnCostUsd = event.costUsd;
              this.usageState = "costing";
            }

            this.usageWaiter?.();
            continue;
          }

          this.transcript.append(event,);
        }
      },
    },);

    try {
      await this.rpc.request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: "loop-lore", version: "1", },
        clientCapabilities: { fs: { readTextFile: this.opts.readTextFile !== undefined, }, },
      },);

      const session = await this.rpc.request("session/new", {
        cwd: this.opts.cwd ?? process.cwd(),
        mcpServers: [],
      },) as {
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
   * refused with the protocol's `cancelled` outcome) — multiplexing across
   * profiles is the runtime queue's job, not this engine's.
   * @param method - wire method the harness invoked
   * @param params - raw request params
   * @returns the response result payload.
   */
  private handleServerRequest(method: string, params: unknown,): Promise<unknown> {
    // The spec REQUIRES `sessionId` on the session-scoped requests: a payload
    // naming another session is refused as invalid params, never answered.
    const foreign = this.foreignSessionId(params,);
    if (foreign !== null) {
      return Promise.reject(new JsonRpcRequestError(`${method} names session "${foreign}"`, -32602,),);
    }

    if (method === "session/request_permission") {
      // The spec carries the tool call in `toolCall` (required); its `kind` is
      // the tool-call kind the policy classifies (vendored v1 schema,
      // `RequestPermissionRequest`).
      const p = params as { toolCall?: { kind?: unknown } } | null;

      if (this.permission) {
        // One ask per connection. The concurrent ask is refused SPEC-LEGALLY:
        // the protocol's `cancelled` outcome (vendored v1 schema,
        // `RequestPermissionOutcome`), never a JSON-RPC error.
        return Promise.resolve({ outcome: { outcome: "cancelled", }, },);
      }

      const { promise, resolve, } = Promise.withResolvers<unknown>();
      const pending: PendingPermission = {
        params,
        kind: typeof p?.toolCall?.kind === "string" ? p.toolCall.kind : null,
      };

      this.permission = { pending, respond: resolve, };
      this.opts.onPermissionRequest?.(pending,);
      return promise;
    }

    if (method === "fs/read_text_file") {
      const reader = this.opts.readTextFile;
      if (!reader) {
        return Promise.reject(new JsonRpcRequestError(`unsupported server request: ${method}`, -32601,),);
      }

      const request = params as { path?: unknown; line?: unknown; limit?: unknown } | null;
      const path = request?.path;
      if (typeof path !== "string") {
        return Promise.reject(new JsonRpcRequestError("fs/read_text_file missing path", -32602,),);
      }

      return reader(path,).then((content,) => ({
        content: sliceRequestedLines(content, request?.line, request?.limit,),
      }));
    }

    return Promise.reject(new JsonRpcRequestError(`unsupported server request: ${method}`, -32601,),);
  }

  /**
   * The session a server-originated payload names, when it is NOT the one
   * this connection established. The spec requires `sessionId` on the
   * session-scoped requests; a payload for another session is refused. A
   * payload without a session id is accepted (the client cannot prove a
   * mismatch, and a harness that omits it still works).
   * @param params - the raw request/notification params
   * @returns the foreign session id, or null when the payload names this session.
   */
  private foreignSessionId(params: unknown,): string | null {
    const sessionId = (params as { sessionId?: unknown } | null)?.sessionId;
    if (typeof sessionId !== "string" || sessionId === "") { return null; }
    return this.session !== null && sessionId !== this.session.sessionId ? sessionId : null;
  }

  /**
   * Normalize the wire usage object (token counts only).
   *
   * The COST does not come from here: the stable ACP v1 `PromptResponse` has
   * no `usage` property at all (schema.md, `PromptResponse`), so a conformant
   * harness never carries one. The only spec carrier of cost is the
   * `usage_update` event, whose `used`/`size` are CONTEXT-WINDOW metrics
   * ("Tokens currently in context" / "Total context window size in tokens"),
   * not this turn's input/output counts - they are never mapped onto them.
   * @param usage - raw usage from the prompt response
   * @returns usage, or null when the response carried none.
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

  /**
   * Wait, bounded, for the next usage notification of this session.
   *
   * The ACP cost rides a session notification, so a harness may report it
   * after the prompt response; without this wait the late report is dropped.
   */
  private async drainUsage(): Promise<void> {
    await new Promise<void>((resolve,) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiter = (): void => {
        if (timer !== undefined) { clearTimeout(timer,); }
        this.usageWaiter = null;
        resolve();
      };

      timer = setTimeout(waiter, USAGE_DRAIN_MS,);
      this.usageWaiter = waiter;
    },);
  }
}
