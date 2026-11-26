// SPDX-License-Identifier: LGPL-3.0-or-later
// Single protocol adapter class; structural split tracked as size debt (see ticket).
// size-allow: 565
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

import { isAbsolute, } from "node:path";
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
  type WirePermissionOutcome,
} from "./adapter-types";
import { JsonRpcProcess, JsonRpcRequestError, } from "./jsonrpc-process";
import { advertisedPermissionOptions, answerCarriesDecision, wirePermissionOutcome, } from "./permission-outcome";
import { type HarnessTurnTranscript, TurnTranscriptCollector, } from "./turn-transcript";

/** ACP protocol version requested when a flavor does not configure one. */
const DEFAULT_PROTOCOL_VERSION = 1;

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
 * Resolve the extra workspace roots for `session/new`, rejecting a relative
 * entry locally before the request goes out (a harness would resolve it
 * against its own cwd — never what the profile meant).
 * @param dirs - the profile-configured roots, when any
 * @returns the roots, verbatim
 * @throws {HarnessAcpError} kind `session` when an entry is not an absolute path.
 */
export function resolveAdditionalDirectories(dirs: string[] | undefined,): string[] {
  const list = dirs ?? [];
  for (const dir of list) {
    if (typeof dir !== "string" || dir.trim() === "" || !isAbsolute(dir,)) {
      throw new HarnessAcpError("session", `additionalDirectories must be absolute paths (got "${String(dir,)}")`,);
    }
  }

  return [...list,];
}

/**
 * Options shared by every generic-ACP harness adapter: the spawn command
 * plus the per-connection knobs declared on {@link HarnessAdapterCommandOptions}.
 */
export interface GenericAcpOptions extends HarnessAdapterCommandOptions {
  /** Spawn argv for the harness's ACP server. */
  command: string[];
}

/**
 * The client's answer to an `elicitation/create` form ask: the human
 * decision through the permission-queue seam, with approve accepting and
 * deny declining. `content` stays omitted — the queue carries approve/deny,
 * never form values.
 */
export type ElicitationAnswer = { action: "accept" | "decline" | "cancel" };

/** Whether raw server-request params are an `elicitation/create` ask (it carries a `mode`; permission asks never do). */
function isElicitationParams(params: unknown,): boolean {
  return typeof (params as { mode?: unknown } | null)?.mode === "string";
}

/**
 * Map a human decision onto the elicitation answer. Every decision is
 * expressible (the spec's accept/decline needs no option ids), so this
 * never refuses — approvals accept, everything else declines.
 * @param outcome - the client's decision
 */
function elicitationAnswer(outcome: PermissionOutcome,): ElicitationAnswer {
  return outcome.outcome === "allow_once" || outcome.outcome === "allow_always"
    ? { action: "accept", }
    : { action: "decline", };
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
  /** The mode the session last confirmed via `session/set_mode`; null when never set. */
  private modeId: string | null = null;
  /** Protocol version the agent selected at initialize; null before the handshake. */
  private version: number | null = null;
  /** Agent capabilities from the initialize result; {} when the agent sent none. */
  private agentCapabilities: Record<string, unknown> = {};

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
   * The mode the session last confirmed via `session/set_mode`; null before
   * the first successful call.
   * @returns the confirmed mode id, or null.
   */
  currentModeId(): string | null {
    return this.modeId;
  }

  /**
   * Switch the session's mode (plan/act) via `session/set_mode`.
   * @param modeId - the mode id, or omitted for the profile-configured default
   * @returns the harness's reply (its confirmed mode when it echoes one)
   * @throws {HarnessAcpError} kind `session` when no mode id is known or the harness rejects it
   */
  async setMode(modeId?: string,): Promise<unknown> {
    const id = modeId ?? this.opts.mode;
    if (!id) {
      throw new HarnessAcpError("session", "no mode id: pass one or configure the profile's mode",);
    }

    try {
      const sessionId = (await this.ensureSession()).sessionId;
      const result = await this.rpc!.request("session/set_mode", { sessionId, modeId: id, },) as {
        currentModeId?: unknown;
      } | null;

      const confirmed = result && typeof result.currentModeId === "string" && result.currentModeId !== ""
        ? result.currentModeId
        : id;

      this.modeId = confirmed;
      return result;
    } catch (error) {
      throw toAcpError("session", error,);
    }
  }

  /**
   * Sessions the harness remembers, via `session/list`.
   * @returns session ids with their cwd, when the harness reports one.
   * @throws {HarnessAcpError} kind `session` on failure
   */
  async listSessions(): Promise<Array<{ sessionId: string; cwd: string | null }>> {
    try {
      await this.ensureTransport();
      const result = await this.rpc!.request("session/list", {},) as {
        sessions?: Array<{ sessionId?: unknown; cwd?: unknown }>;
      } | null;

      const sessions = Array.isArray(result?.sessions,) ? result.sessions : [];
      return sessions.flatMap((entry,) =>
        typeof entry?.sessionId === "string" && entry.sessionId !== ""
          ? [{ sessionId: entry.sessionId, cwd: typeof entry.cwd === "string" ? entry.cwd : null, },]
          : []
      );
    } catch (error) {
      throw toAcpError("session", error,);
    }
  }

  /**
   * Re-attach to a remembered session via `session/resume`, without replay:
   * the transcript restarts empty and the next prompt continues the session.
   * @param sessionId - the remembered session id
   * @throws {HarnessAcpError} kind `session` on failure
   */
  async resumeSession(sessionId: string,): Promise<void> {
    try {
      await this.ensureTransport();
      const result = await this.rpc!.request("session/resume", { sessionId, },);
      this.transcript = new TurnTranscriptCollector();
      this.session = { sessionId, options: result, };
    } catch (error) {
      throw toAcpError("session", error,);
    }
  }

  /**
   * Re-attach to a remembered session via `session/load`, replaying its
   * history: the harness re-emits `session/update` notifications, which the
   * engine folds into a fresh transcript.
   * @param sessionId - the remembered session id
   * @returns the replayed transcript
   * @throws {HarnessAcpError} kind `session` on failure
   */
  async loadSession(sessionId: string,): Promise<HarnessTurnTranscript> {
    try {
      await this.ensureTransport();
      // Bind the target id BEFORE the request: the replay notifications name
      // it, and the foreign-session filter drops anything not naming the
      // bound session. The previous binding is restored on failure.
      const previous = this.session;
      this.session = { sessionId, options: previous?.options ?? null, };
      this.transcript = new TurnTranscriptCollector();
      try {
        const result = await this.rpc!.request("session/load", { sessionId, },);
        this.session = { sessionId, options: result, };
        return this.transcript.snapshot();
      } catch (error) {
        this.session = previous;
        throw error;
      }
    } catch (error) {
      throw toAcpError("session", error,);
    }
  }

  /**
   * The protocol version the agent selected at initialize; null before the
   * handshake. Read from the initialize RESULT, never from the request.
   */
  negotiatedProtocolVersion(): number | null {
    return this.version;
  }

  /**
   * Delete a remembered session via the v2-only `session/delete` method.
   * ACP v2 gates this method on `capabilities.session.delete`; a v1 agent or
   * one that did not advertise it never sees the request (version alone is
   * NOT an invitation to assume the method exists).
   * @param sessionId - the session to delete
   * @throws {HarnessAcpError} kind `session` when unadvertised or rejected
   */
  async deleteSession(sessionId: string,): Promise<void> {
    await this.ensureTransport();
    const session = this.agentCapabilities["session"];
    const advertised = session !== null && typeof session === "object"
      ? (session as Record<string, unknown>)["delete"]
      : undefined;

    if (this.version !== 2 || advertised === undefined || advertised === null) {
      throw new HarnessAcpError("session", "v2 session/delete is not advertised by this agent",);
    }

    try {
      await this.rpc!.request("session/delete", { sessionId, },);
    } catch (error) {
      throw toAcpError("session", error,);
    }
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

    // A cancelled turn MUST answer every parked ask with the protocol's
    // cancelled outcome (vendored v1 schema, `RequestPermissionOutcome`) —
    // or, for a parked form elicitation, the elicitation spec's `cancel`.
    const open = this.permission;
    if (open) {
      this.permission = null;
      open.respond(
        isElicitationParams(open.pending.params,) ? { action: "cancel", } : { outcome: { outcome: "cancelled", }, },
      );

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
   * In v1 a `cancelled` answer refuses the tool call, but it also tells the
   * agent the TURN was cancelled: a conformant agent may abort the turn.
   * @param outcome - the client's choice among the harness's options
   * @returns the answer that went on the wire
   * @throws {PermissionAskGoneError} when nothing is pending
   * @throws {PermissionDecisionRefusedError} when the harness could not
   *   express the decision and refused the tool call instead
   */
  respondPermission(outcome: PermissionOutcome,): WirePermissionOutcome {
    const open = this.permission;
    if (!open) { throw new PermissionAskGoneError(); }
    this.permission = null;
    if (isElicitationParams(open.pending.params,)) {
      // A parked form elicitation answers in its own spec shape, not the
      // permission shape. The return keeps the declared type (the queue only
      // logs it), while the wire carries the spec's accept/decline action.
      const answer = elicitationAnswer(outcome,);
      open.respond(answer,);
      return answer as unknown as WirePermissionOutcome;
    }

    const options = advertisedPermissionOptions(open.pending.params,);
    const answer = wirePermissionOutcome(outcome, options,);
    open.respond({ outcome: answer, },);
    if (!answerCarriesDecision(answer, outcome, options,)) { throw new PermissionDecisionRefusedError(answer,); }
    return answer;
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
    this.version = null;
    this.agentCapabilities = {};
    const parked = this.permission !== null;
    this.permission = null;
    if (parked) { this.opts.onPermissionWithdrawn?.(); }
  }

  /**
   * Ensure the transport is up without establishing a session: list/resume/
   * load run against a REMEMBERED id, so they must not mint a fresh one.
   * @throws {HarnessAcpError} on spawn/initialize failure
   */
  private async ensureTransport(): Promise<void> {
    if (!this.rpc) { await this.ensureSession(); }
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
      const requestedVersion = this.opts.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
      if (!Number.isInteger(requestedVersion,) || requestedVersion < 1) {
        throw new HarnessAcpError("initialize", `invalid requested protocolVersion: ${requestedVersion}`,);
      }

      const init = await this.rpc.request("initialize", {
        protocolVersion: requestedVersion,
        clientInfo: { name: "loop-lore", version: "1", },
        // Capabilities are advertised only when a handler exists: an omitted
        // bridge reads as UNSUPPORTED, so a bridge without a handler must
        // never be advertised.
        clientCapabilities: {
          fs: {
            readTextFile: this.opts.readTextFile !== undefined,
            writeTextFile: this.opts.writeTextFile !== undefined,
          },
        },
      },) as { protocolVersion?: unknown; capabilities?: unknown } | null;

      // The agent's answer is authoritative: v2-only methods are gated on
      // what it selected AND advertised, never on what we requested.
      const chosen = init && typeof init.protocolVersion === "number" && Number.isInteger(init.protocolVersion,)
        ? init.protocolVersion
        : requestedVersion;

      if (chosen !== 1 && chosen !== 2) {
        throw new HarnessAcpError("initialize", `unsupported ACP protocol version: ${chosen}`,);
      }

      this.version = chosen;
      this.agentCapabilities = init && typeof init.capabilities === "object" && init.capabilities !== null
        ? init.capabilities as Record<string, unknown>
        : {};

      // Absolute roots ride `session/new`; a relative entry is rejected
      // locally before the request goes out.
      const additionalDirectories = resolveAdditionalDirectories(this.opts.additionalDirectories,);
      const session = await this.rpc.request("session/new", {
        cwd: this.opts.cwd ?? process.cwd(),
        mcpServers: this.opts.mcpServers ?? [],
        ...(additionalDirectories.length > 0 ? { additionalDirectories, } : {}),
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
   * until `respondPermission`, form elicitations park on the same single
   * slot (approve accepts, deny declines), fs bridge asks go through the
   * injected reader/writer, anything else answers unsupported. The single
   * slot stays SINGLE per connection on purpose (harnesses serialize asks;
   * a concurrent ask is refused with the protocol's `cancelled` outcome) —
   * multiplexing across profiles is the runtime queue's job, not this
   * engine's.
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
        // the protocol's `cancelled` outcome (vendored v1 schema) — in v1 it
        // tells the agent the TURN was cancelled, so it may abort the turn.
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

    if (method === "elicitation/create") {
      return this.serveElicitation(params,);
    }

    if (method === "fs/read_text_file" || method === "fs/write_text_file") {
      return this.handleFsRequest(method, params,);
    }

    return Promise.reject(new JsonRpcRequestError(`unsupported server request: ${method}`, -32601,),);
  }

  /**
   * Serve an `elicitation/create` ask through the single human-decision
   * slot: an elicitation carries no tool kind, so it always requires
   * approval, and the human answer maps to accept/decline via
   * {@link respondPermission}. Only `form` is attended — any other mode is
   * an explicit -32602, never silence (an unanswered request would leave
   * the agent waiting).
   * @param params - the raw elicitation request params
   */
  private serveElicitation(params: unknown,): Promise<unknown> {
    const mode = (params as { mode?: unknown } | null)?.mode;
    if (mode !== "form") {
      return Promise.reject(
        new JsonRpcRequestError(
          `unsupported elicitation mode: ${typeof mode === "string" ? mode : "none"}`,
          -32602,
        ),
      );
    }

    if (this.permission) {
      // One ask per connection, as with permission asks — the concurrent
      // ask is cancelled in its own spec shape.
      return Promise.resolve({ action: "cancel", } satisfies ElicitationAnswer,);
    }

    const { promise, resolve, } = Promise.withResolvers<unknown>();
    const pending: PendingPermission = { params, kind: null, };
    this.permission = { pending, respond: resolve, };
    this.opts.onPermissionRequest?.(pending,);
    return promise;
  }

  /**
   * Serve one server-originated fs bridge request: reads go through the
   * injected reader, writes through the injected writer. Either bridge
   * answers `-32601` unsupported without its handler — the capability is
   * advertised only when the handler exists, so this is the harness
   * ignoring the contract, not a loop-lore gap.
   * @param method - `fs/read_text_file` or `fs/write_text_file`
   * @param params - raw request params
   * @returns the response result payload.
   */
  private handleFsRequest(method: string, params: unknown,): Promise<unknown> {
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

    const writer = this.opts.writeTextFile;
    if (!writer) {
      return Promise.reject(new JsonRpcRequestError(`unsupported server request: ${method}`, -32601,),);
    }

    const request = params as { path?: unknown; content?: unknown } | null;
    const path = request?.path;
    if (typeof path !== "string") {
      return Promise.reject(new JsonRpcRequestError("fs/write_text_file missing path", -32602,),);
    }

    const content = request?.content;
    if (typeof content !== "string") {
      return Promise.reject(new JsonRpcRequestError("fs/write_text_file missing content", -32602,),);
    }

    // The spec's WriteTextFileResponse carries only `_meta`: success is `{}`.
    return writer(path, content,).then(() => ({}));
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
