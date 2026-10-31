// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness-agnostic ACP adapter contract.
 *
 * Everything outside `omp.ts` (registry, selector, ledger, breaker,
 * telemetry) consumes THIS interface; omp-specific wire details stay inside
 * the omp reference implementation. A future opencode/codex/claude-code
 * adapter implements the same four verbs over its own harness flavor.
 *
 * Wire facts (verified against the vendored ACP protocol,
 * oh-my-pi packages/utils/src/acp/connection.ts:223-287): JSON-RPC 2.0 over
 * stdio, newline-delimited; methods `initialize`, `session/new`,
 * `session/set_config_option`, `session/prompt`; notifications
 * `session/update`, `session/request_permission`.
 */

/** Quota report status, as published by harness `_omp/usage`-style reports. */
export type HarnessUsageStatus = "ok" | "warning" | "exhausted" | "unknown";

/** One provider quota report, normalized across harnesses. */
export interface HarnessUsageReport {
  /** Provider id inside the harness (e.g. `zai`). */
  providerId: string;
  status: HarnessUsageStatus;
  /** Remaining fraction 0..1, or null when the harness does not say. */
  remainingFraction: number | null;
  /** ISO timestamp when the quota window resets, or null. */
  resetsAt: string | null;
}

/** Token usage of one finished turn. */
export interface HarnessTurnUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Result of one harness turn. */
export interface HarnessTurnResult {
  /** Collected response text (agent message chunks concatenated). */
  text: string;
  /** Harness stop reason (`end_turn`, `max_tokens`, ...). */
  stopReason: string;
  usage: HarnessTurnUsage | null;
  /** ACP session id the turn ran in, when the harness reported one. */
  acpSessionId: string | null;
}

/** Typed failure kinds a harness adapter reports. `@throws` never — errors are values. */
export type HarnessAcpErrorKind =
  | "spawn"
  | "initialize"
  | "session"
  | "model"
  | "prompt"
  | "closed";

/** Error raised (via promise rejection) by an adapter call. */
export class HarnessAcpError extends Error {
  /** Machine-readable failure class the selector's breaker keys off. */
  readonly kind: HarnessAcpErrorKind;

  /**
   * @param kind - failure class
   * @param message - human-readable detail
   * @param options - cause chain, when wrapping a lower error
   */
  constructor(kind: HarnessAcpErrorKind, message: string, options?: { cause?: unknown },) {
    super(message, { cause: options?.cause, },);
    this.name = "HarnessAcpError";
    this.kind = kind;
  }
}

/**
 * One live connection to a harness profile. All methods may reject with
 * {@link HarnessAcpError}; the caller records the failure with its breaker.
 */
export interface HarnessAcpAdapter {
  /** Model ids the harness currently advertises (`provider/id` strings). */
  enumerateModels(): Promise<string[]>;
  /**
   * Switch the session's model to a concrete advertised id.
   * @param modelId - concrete `provider/id` model id
   * @throws {HarnessAcpError} kind `model` when the harness rejects the id
   */
  setModel(modelId: string,): Promise<void>;
  /**
   * Run one prompt turn and collect the response.
   * @param prompt - the user prompt text
   * @throws {HarnessAcpError} kind `prompt`/`closed` on failure
   */
  prompt(prompt: string,): Promise<HarnessTurnResult>;
  /**
   * Quota reports, when the harness publishes them.
   * @returns reports, or null when the harness has no quota surface.
   */
  fetchUsageReports(): Promise<HarnessUsageReport[] | null>;
  /** Terminate the underlying process/connection. Idempotent. */
  close(): void;
}

/**
 * Factory the registry uses to connect one profile. Production passes the
 * omp adapter; tests pass a fake. Must not throw — connection failures are
 * reported through the first adapter call rejecting.
 * @param profile - profile name being connected
 * @param command - spawn argv from the profile config
 */
export type HarnessAdapterFactory = (
  profile: string,
  command: string[],
) => PromiseLike<HarnessAcpAdapter> | HarnessAcpAdapter;
