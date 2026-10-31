// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * omp.ts — the omp reference {@link HarnessAcpAdapter} (harness-specific;
 * nothing outside this file may assume omp wire details).
 *
 * Lifecycle: spawn the profile's argv → `initialize` → `session/new {cwd}` →
 * the session lives for the adapter's lifetime. Each turn:
 * `session/set_config_option` (configId MODEL_CONFIG_ID = the selected
 * `provider/id` model) then `session/prompt`, collecting agent_message_chunk
 * `session/update` notification text and the response's stopReason + usage.
 *
 * Wire casing verified against oh-my-pi packages/utils/src/acp/connection.ts:
 * methods are `initialize`, `session/new`, `session/set_config_option`,
 * `session/prompt`; update notifications arrive as `session/update`.
 */

import {
  type HarnessAcpAdapter,
  HarnessAcpError,
  type HarnessTurnResult,
  type HarnessUsageReport,
} from "./adapter-types";
import { JsonRpcProcess, JsonRpcRequestError, } from "./jsonrpc-process";

/** Config option id omp uses for its model select (acp-agent.ts #buildConfigOptions). */
const MODEL_CONFIG_ID = "MODEL_CONFIG_ID";

/** ACP protocol version the adapter speaks. */
const PROTOCOL_VERSION = 1;

/** Adapter options. */
export interface OmpAdapterOptions {
  /** Profile spawn argv (e.g. `["omp", "acp", "--profile", "glm"]`). */
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

/** A session/update notification payload. */
interface SessionUpdateParams {
  update?: { sessionUpdate?: unknown; content?: TextBlock | null };
}

/** Shape of a text content block. */
interface TextBlock {
  type: string;
  text?: string;
}

/** */
export class OmpAcpAdapter implements HarnessAcpAdapter {
  private rpc: JsonRpcProcess | null = null;
  private sessionId: string | null = null;
  private readonly opts: OmpAdapterOptions;
  /** agent_message_chunk text accumulated during the in-flight prompt. */
  private chunks: string[] = [];

  /**
   * @param options - spawn argv + cwd; the handshake happens lazily on the
   * first adapter call so a missing binary surfaces as a typed probe failure.
   */
  constructor(options: OmpAdapterOptions,) {
    this.opts = options;
  }

  /**
   * Enumerate the advertised model list.
   * @returns model ids (`provider/id`) from session/new configOptions.
   * @throws {HarnessAcpError} kind `spawn`/`initialize`/`session` on failure
   */
  async enumerateModels(): Promise<string[]> {
    const { options, } = await this.ensureSession();
    const select = (options as Array<{ id?: unknown; type?: unknown; options?: Array<{ value?: unknown }> }>)
      ?.find((o,) => o.id === MODEL_CONFIG_ID);

    return (select?.options ?? [])
      .map((o,) => String(o.value ?? "",))
      .filter((v,) => v.length > 0);
  }

  /**
   * Switch the session model via session/set_config_option.
   * @param modelId - concrete `provider/id` model id
   * @throws {HarnessAcpError} kind `model` when the harness rejects the id
   */
  async setModel(modelId: string,): Promise<void> {
    try {
      const sessionId = await this.ensureSessionId();
      await this.rpc!.request("session/set_config_option", {
        sessionId,
        configId: MODEL_CONFIG_ID,
        value: modelId,
      },);
    } catch (error) {
      throw toAcpError("model", error,);
    }
  }

  /**
   * Run one prompt turn.
   * @param prompt - the prompt text
   * @returns collected text, stop reason, usage, session id.
   * @throws {HarnessAcpError} kind `prompt` on failure
   */
  async prompt(prompt: string,): Promise<HarnessTurnResult> {
    try {
      const sessionId = await this.ensureSessionId();
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
   * Quota reports via the omp ext method `_omp/usage`.
   * @returns normalized reports, or null when the harness exposes none.
   */
  async fetchUsageReports(): Promise<HarnessUsageReport[] | null> {
    try {
      await this.ensureSessionId();
      const result = await this.rpc!.request("_omp/usage", {},) as { reports?: unknown } | null;
      const reports = Array.isArray(result?.reports,) ? result!.reports : [];
      return (reports as Array<Record<string, unknown>>).map((r,) => ({
        providerId: typeof r.providerId === "string" ? r.providerId : "unknown",
        status: this.toStatus(r.status,),
        remainingFraction: typeof r.remainingFraction === "number" ? r.remainingFraction : null,
        resetsAt: typeof r.resetsAt === "string" ? r.resetsAt : null,
      }));
    } catch {
      return null; // No quota surface is a normal condition, not a failure.
    }
  }

  /** Terminate the underlying process. Idempotent. */
  close(): void {
    this.rpc?.close();
    this.rpc = null;
    this.sessionId = null;
  }

  /**
   * Ensure the process is spawned and the session established.
   * @returns sessionId plus the session/new response (for configOptions).
   * @throws {HarnessAcpError} on spawn/initialize/session failure
   */
  private async ensureSession(): Promise<{ sessionId: string; options: unknown }> {
    if (this.sessionId) {
      return { sessionId: this.sessionId, options: null, };
    }

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

      this.sessionId = session.sessionId;
      return { sessionId: session.sessionId, options: session.configOptions, };
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
   * Session id only, for turns after the probe.
   * @returns the session id.
   * @throws {HarnessAcpError} on session failure
   */
  private async ensureSessionId(): Promise<string> {
    return (await this.ensureSession()).sessionId;
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

  /**
   * Coerce a raw report status to the normalized union.
   * @param status - raw status value
   * @returns a known status; unknown values map to `"unknown"`.
   */
  private toStatus(status: unknown,): HarnessUsageReport["status"] {
    return status === "ok" || status === "warning" || status === "exhausted" || status === "unknown"
      ? status
      : "unknown";
  }
}

/**
 * Factory the ProfileRegistry uses in production.
 * @param _profile - profile name (unused; argv carries omp's --profile)
 * @param command - the profile's spawn argv
 * @returns the omp adapter.
 */
export function createOmpAdapter(_profile: string, command: string[],): HarnessAcpAdapter {
  return new OmpAcpAdapter({ command, },);
}
