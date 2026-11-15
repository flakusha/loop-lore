// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness-agnostic ACP adapter contract.
 *
 * Everything outside `omp.ts` (registry, selector, ledger, breaker,
 * telemetry) consumes THIS interface; omp-specific wire details stay inside
 * the omp reference implementation. A future opencode/codex/claude-code
 * adapter implements the same verbs over its own harness flavor.
 *
 * Wire facts (verified against the vendored ACP protocol,
 * oh-my-pi packages/utils/src/acp/connection.ts:223-287): JSON-RPC 2.0 over
 * stdio, newline-delimited; client methods `initialize`, `session/new`,
 * `session/set_config_option`, `session/prompt`; client notification
 * `session/cancel`; server-originated requests `session/request_permission`,
 * `fs/read_text_file`; notifications `session/update`, `_omp/usage`-style
 * reports.
 */

import { type HarnessTurnTranscript, } from "./turn-transcript";

/** Quota report status, as published by harness `_omp/usage`-style reports. */
export type HarnessUsageStatus = "ok" | "warning" | "exhausted" | "unknown";

/**
 * Which provider-quota wire surface an adapter publishes, as a closed union.
 *
 * Wire survey (2026-11-11): ACP v1 has NO requestable quota method — its only
 * usage element is the `usage_update` session-update notification, which
 * reports context-window fill (`used`/`size`) plus optional session cost, i.e.
 * not provider quota. The one real surface is omp's private `_omp/usage` ext
 * method; every other flavor declares "none". The usage-ledger's config
 * limits still bound every profile either way.
 */
export const HARNESS_QUOTA_SURFACES = ["omp-ext", "none",] as const;
/** A `HARNESS_QUOTA_SURFACES` member. */
export type HarnessQuotaSurface = (typeof HARNESS_QUOTA_SURFACES)[number];

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

/**
 * Token usage of one finished turn. Null when the harness reported no token
 * counts - the counts never come from the `usage_update` event, whose `used`
 * and `size` are CONTEXT-WINDOW metrics, not this turn's input/output tokens.
 */
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
  /**
   * Cost the harness reported, in USD; null when it reported none. The cost
   * rides the `usage_update` event (the stable ACP v1 `PromptResponse` has no
   * `usage` property at all), and the protocol reports it as the SESSION's
   * cumulative cost - a multi-turn session stores the running total per turn.
   */
  costUsd: number | null;
  /** ACP session id the turn ran in, when the harness reported one. */
  acpSessionId: string | null;
  /** Everything the turn streamed: text, reasoning, tool calls, tool results. */
  transcript: HarnessTurnTranscript;
}

/** Typed failure kinds a harness adapter reports. `@throws` never — errors are values. */
export type HarnessAcpErrorKind =
  | "spawn"
  | "initialize"
  | "session"
  | "model"
  | "prompt";

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
 * Raised when a permission decision targets an ask the harness NO LONGER
 * HOLDS — the turn was cancelled or the ask was withdrawn. Distinct from a
 * transport failure: the ask is gone, so no retry can ever deliver it.
 */
export class PermissionAskGoneError extends HarnessAcpError {
  /**
   * @param message - human-readable detail
   */
  constructor(message = "no pending permission request",) {
    super("session", message,);
    this.name = "PermissionAskGoneError";
  }
}

/**
 * The spec's answer to a permission request (vendored ACP v1 schema,
 * `RequestPermissionOutcome`) — the ONLY two shapes the protocol allows. The
 * mapping from a decision onto this shape lives in permission-outcome.ts.
 */
export type WirePermissionOutcome =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

/**
 * Raised when the harness REFUSES a decision it cannot express: the wire
 * answer carries a rejection, so the decision did not take effect. The ask is
 * answered either way - nothing is left to decide.
 */
export class PermissionDecisionRefusedError extends PermissionAskGoneError {
  /** The answer that went on the wire: it refused the tool call. */
  readonly answer: WirePermissionOutcome;

  /**
   * @param answer - the wire answer that carried the refusal
   * @param message - human-readable detail
   */
  constructor(
    answer: WirePermissionOutcome,
    message = "the harness refused the decision - the tool call was refused",
  ) {
    super(message,);
    this.name = "PermissionDecisionRefusedError";
    this.answer = answer;
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
   * @throws {HarnessAcpError} kind `prompt` on failure
   */
  prompt(prompt: string,): Promise<HarnessTurnResult>;
  /**
   * Cancel the in-flight prompt turn via the `session/cancel` notification.
   * @throws {HarnessAcpError} kind `session` when no live session exists
   */
  cancel(): Promise<void>;
  /**
   * Quota reports, when the harness publishes them.
   * @returns reports, or null when the harness has no quota surface.
   */
  fetchUsageReports(): Promise<HarnessUsageReport[] | null>;
  /**
   * The provider-quota wire surface this adapter publishes. A static wire
   * fact, readable without spawning: the usage ledger and the admin usage
   * surface render it verbatim, with "none" meaning the config limits are
   * the only quota bound on the profile.
   */
  readonly quotaSurface: HarnessQuotaSurface;
  /** The open server-originated permission request, when one awaits an outcome. */
  pendingPermission(): PendingPermission | null;
  /**
   * Answer the open permission request.
   * @param outcome - the client's choice among the harness's options
   * @returns the answer that went on the wire
   * @throws {PermissionAskGoneError} when the harness no longer holds the ask
   * @throws {PermissionDecisionRefusedError} when the harness could not
   *   express the decision and refused the tool call instead
   */
  respondPermission(outcome: PermissionOutcome,): WirePermissionOutcome;
  /** Terminate the underlying process/connection. Idempotent. */
  close(): void;
}

/**
 * The client's DECISION about a server-originated `session/request_permission`
 * — the internal vocabulary, not the wire shape. The wire answer is the
 * spec's `RequestPermissionOutcome` (see {@link WirePermissionOutcome}).
 */
export interface PermissionOutcome {
  /** The decision's verb — the spec's `PermissionOptionKind` vocabulary. */
  outcome: "allow_once" | "allow_always" | "reject_once" | "reject_always" | "cancelled";
  /** Chosen option id, when the harness's permission options carry ids. */
  optionId?: string;
}

/** A server-originated permission request awaiting the client's outcome. */
export interface PendingPermission {
  /** Raw `session/request_permission` params (options, tool call, ...). */
  params: unknown;
  /** The tool-call kind the harness asked about, when given. */
  kind: string | null;
}

/** Optional per-connection knobs a flavor factory may pass through. */
export interface HarnessAdapterCommandOptions {
  /** Working directory for session/new. */
  cwd?: string;
  /** Per-request timeout in ms. */
  requestTimeoutMs?: number;
  /** Serves server-originated `fs/read_text_file` asks; without one the adapter answers them as unsupported. */
  readTextFile?: (path: string,) => Promise<string>;
  /** Called once per open permission request, so hosts can prompt a human. */
  onPermissionRequest?: (pending: PendingPermission,) => void;
  /** Called when the connection dies or closes with an ask still parked, so hosts drop the queue entry. */
  onPermissionWithdrawn?: () => void;
}

/**
 * Factory the registry uses to connect one profile. Production passes the
 * omp adapter; tests pass a fake. Must not throw — connection failures are
 * reported through the first adapter call rejecting.
 * @param profile - profile name being connected
 * @param command - spawn argv from the profile config
 * @param options - optional cwd/timeout/read-file/permission knobs
 */
export type HarnessAdapterFactory = (
  profile: string,
  command: string[],
  options?: HarnessAdapterCommandOptions,
) => PromiseLike<HarnessAcpAdapter> | HarnessAcpAdapter;
