// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AUX Pipeline — Runner
 *
 * Single shared policy for all auxiliary LLM calls:
 * - Fast resolution: auxiliary model role, small max tokens
 * - Hard timeout: never block the chat path
 * - Deterministic: 0.0 temperature
 * - BYO parity: apiKey resolved via resolveProvider (user → chat/actor → server)
 * - Telemetry: one event per call with latency + token usage
 *
 * Graceful degradation: any failure returns null — callers fall back.
 */
import type { Kysely, } from "kysely";
import { type ResolvedModelRole, resolveModelRole, } from "../admin/model-roles";
import type { Config, } from "../config/schema";
import { ModelRole, } from "../db/enums-core";
import type { DB, } from "../db/schema";
import type { GenerationMessage, } from "../generation/gen-types-options";
// hint: Logic changed on both sides. Requires understanding intent of each change.
import { buildFailoverList, resolveProvider, } from "../generation/providers/registry";
import { toHarnessTaskType, toTaskSignal, } from "../generation/routing/task-signal";
import { recordExecRun, } from "../harness/exec-recorder";
import { callWithFailover, } from "../generation/providers/call-with-failover";
import { getProvider, resolveProvider, } from "../generation/providers/registry";
import { getSchedulerManager, } from "../generation/scheduler";
import { PriorityLevel, } from "../llm";
import { getLogger, } from "../logger";
import { isTelemetryEnabled, record, } from "../telemetry/service";
import type { AuxCallOptions, AuxCallResult, AuxTaskName, } from "./types";

const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_TEMPERATURE = 0;
const DEFAULT_MAX_TOKENS = 100;
const AUX_TELEMETRY_EVENT = "aux.call";

/**
 * Module logger for the aux pipeline.
 * @returns the child logger for aux-pipeline
 */
function getLog() {
  return getLogger().child({ module: "aux-pipeline", },);
}

/** Tasks that prefer a configured classifier model, falling back to auxiliary. */
const CLASSIFIER_TASKS: Partial<Record<AuxTaskName, true>> = {
  intent: true,
  "injection-check": true,
  transition: true,
  "message-action": true,
  "gm-tool": true,
  moderation: true,
  nsfw: true,
};

/**
 * Resolve the model role for an AUX call.
 *
 * Explicit opts.role wins. Otherwise classifier-preferring tasks try the
 * classifier role (only when actually configured), falling back to auxiliary.
 * @param task - Name of the calling task
 * @param explicitRole - Caller-provided role, if any
 * @param config - Application config
 * @param db - Kysely instance
 * @returns Resolved role, or null when resolution fails
 */
async function resolveAuxRole(
  task: AuxTaskName,
  explicitRole: ModelRole | undefined,
  config: Config,
  db: Kysely<DB>,
): Promise<ResolvedModelRole | null> {
  if (explicitRole !== undefined) {
    return await resolveModelRole(explicitRole, config, db,);
  }

  if (CLASSIFIER_TASKS[task]) {
    try {
      const classifier = await resolveModelRole(ModelRole.Classifier, config, db,);
      if (classifier && classifier.source !== "default") {
        return classifier;
      }
    } catch {
      // Unconfigured classifier — fall through to auxiliary
    }
  }

  return await resolveModelRole(ModelRole.Auxiliary, config, db,);
}

/**
 * Call the auxiliary model with the shared AUX policy.
 *
 * Resolves the model role, threads BYO apiKey (user → chat/actor → server),
 * applies a hard timeout, and records telemetry for every call.
 * @param task - Name of the calling task (telemetry + logs)
 * @param config - Application config
 * @param db - Kysely instance
 * @param messages - Conversation messages for the auxiliary model
 * @param opts - Per-call options (role, timeout, temperature, maxTokens, userId, chatId)
 * @returns Result on success, or null on any failure (timeout, no role, parse, provider error)
 */
export async function callAux(
  task: AuxTaskName,
  config: Config,
  db: Kysely<DB>,
  messages: GenerationMessage[],
  opts: AuxCallOptions = {},
): Promise<AuxCallResult | null> {
  const {
    role,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    userId,
    chatId,
  } = opts;

  // Resolve the model role → provider/model; graceful failure => null (BUG-1 fix)
  let auxRole: ResolvedModelRole | null;
  try {
    auxRole = await resolveAuxRole(task, role, config, db,);
  } catch {
    return null;
  }

  if (!auxRole || !auxRole.provider || !auxRole.model) {
    return null;
  }

  // BYO apiKey parity: user key → chat/actor override → server default
  let apiKey: string | undefined;
  try {
    const resolved = await resolveProvider({
      provider: auxRole.provider,
      model: auxRole.model,
      userId,
      config,
      db,
    },);

    apiKey = resolved.resolvedApiKey;
  } catch {
    // Non-fatal — fall back to the provider instance's configured key
  }

  const provider = getProvider(auxRole.provider,);
  if (!provider) {
    return null;
  }

  const startedAt = Date.now();
  const recordCall = (success: boolean, extra: Record<string, unknown> = {},) => {
    if (!isTelemetryEnabled()) { return; }
    void record(db, {
      eventType: AUX_TELEMETRY_EVENT,
      userId,
      chatId,
      data: {
        task,
        role: auxRole.role,
        model: auxRole.model,
        provider: auxRole.provider,
        latencyMs: Date.now() - startedAt,
        success,
        ...extra,
      },
    },);
  };

  try {
    // Aux bypass routed through failover + scheduler: the aux provider
    // joins one ordered list (primary first, same as interactive turns)
    // and dispatch holds a Low slot keyed by the aux provider name.
    // Null on timeout/cancel like before (graceful degradation); a timeout
    // cancels the slot while still queued — a running provider holds its
    // slot until it returns (no abort is forwarded into the aux call).
    const failover = [{ name: auxRole.provider, provider, },];
    const mgr = getSchedulerManager();
    const auxId = `${task}:${Date.now()}:${Math.random().toString(36,).slice(2,)}`;
    const handle = mgr.submit({
      id: auxId,
      provider: auxRole.provider,
      priority: PriorityLevel.Low,
      run: () =>
        callWithFailover(failover, {
          model: auxRole.model,
          messages,
          apiKey,
          params: { temperature, maxTokens, },
        },),
    },);

    const response = await withTimeout(handle.result, timeoutMs,);
    if (!response) {
      mgr.cancel(auxId, "aux timeout",);
      // Suppress the handle rejection after cancel — it rejects with the
      // scheduler cancellation error, which is expected here.  The old code
      // threw GenerationCancelledError (caught by this catch) but the aux
      // path gracefully returned null; preserve that contract.
      void handle.result.catch(() => {/* timed out, ignore */},);
      recordCall(false, { error: "timeout", },);
      return null;
    }

    const result: AuxCallResult = {
      content: response.content,
      model: auxRole.model,
      provider: auxRole.provider,
      latencyMs: Date.now() - startedAt,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
    };

    recordCall(true, {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    },);

    return result;
  } catch (error) {
    recordCall(false, { error: (error as Error).message, },);
    getLog().debug("AUX call failed", { task, error: (error as Error).message, },);
    return null;
  }
}

/**
 * Run a promise with a hard timeout. Resolves null if the timeout wins.
 * The timer is cleared once the race settles and unref'd so it never
 * keeps the process alive.
 * @param promise
 * @param ms
 * @returns number
 */
async function withTimeout<T,>(promise: Promise<T>, ms: number,): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve,) => {
    timer = setTimeout(() => resolve(null,), ms,);
    timer.unref?.();
  },);

  try {
    return await Promise.race([promise, timeout,],);
  } finally {
    if (timer) { clearTimeout(timer,); }
  }
}
