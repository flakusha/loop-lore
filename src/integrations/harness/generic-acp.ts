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
  type HarnessTurnResult,
  type HarnessUsageReport,
} from "./adapter-types";
import { JsonRpcProcess, JsonRpcRequestError, } from "./jsonrpc-process";

/** ACP protocol version the adapter speaks. */
const PROTOCOL_VERSION = 1;

/** Options shared by every generic-ACP harness adapter. */
export interface GenericAcpOptions {
  /** Spawn argv for the harness's ACP server. */
  command: string[];
  /** Working directory for session/new. */
  cwd?: string;
  /** Per-request timeout in ms. */
  requestTimeoutMs?: number;
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
   * @returns core-facing model ids from the session/new model select.
   * @throws {HarnessAcpError} kind `spawn`/`initialize`/`session` on failure
   */
  async enumerateModels(): Promise<string[]> {
    const { options, } = await this.ensureSession();
    const select = (options as Array<{ id?: unknown; options?: Array<{ value?: unknown }> }> | null)
      ?.find((o,) => o.id === this.modelConfigId);

    return (select?.options ?? [])
      .map((o,) => String(o.value ?? "",))
      .filter((v,) => v.length > 0)
      .map((v,) => this.toCoreModelId(v,));
  }

  /**
   * Switch the session model via session/set_config_option.
   * @throws {HarnessAcpError} kind `model` when the harness rejects the id
   */
  async setModel(modelId: string,): Promise<void> {
    try {
      const sessionId = (await this.ensureSession()).sessionId;
      await this.rpc!.request("session/set_config_option", {
        sessionId,
        configId: this.modelConfigId,
        value: this.toWireModelId(modelId,),
      },);
    } catch (error) {
      throw toAcpError("model", error,);
    }
  }

  /**
   * Run one prompt turn and collect the response.
   * @throws {HarnessAcpError} kind `prompt` on failure
   */
  async prompt(prompt: string,): Promise<HarnessTurnResult> {
    try {
      const sessionId = (await this.ensureSession()).sessionId;
      this.chunks = [];
      const response = await this.rpc!.request("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: prompt, },],
      },) as { stopReason?: unknown; usage?: RawUsage | null };

      return {
        text: this.chunks.join("",),
        stopReason: typeof response.stopReason === "string" ? response.stopReason : "unknown",
        usage: this.toUsage(response.usage,),
        acpSessionId: sessionId,
      };
    } catch (error) {
      throw toAcpError("prompt", error,);
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
    this.rpc = null;
    this.session = null;
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
        configOptions?: unknown;
      };

      if (typeof session.sessionId !== "string" || session.sessionId === "") {
        throw new HarnessAcpError("session", "session/new returned no sessionId",);
      }

      this.session = { sessionId: session.sessionId, options: session.configOptions, };
      return this.session;
    } catch (error) {
      const kind = error instanceof JsonRpcRequestError && error.message.includes("spawn",)
        ? "spawn"
        : error instanceof HarnessAcpError
        ? error.kind
        : "initialize";

      this.close();
      throw toAcpError(kind, error,);
    }
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
