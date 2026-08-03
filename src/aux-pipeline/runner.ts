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
import { resolveModelRole, } from "../admin/model-roles";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import type { GenerationMessage, } from "../generation/gen-types-options";
import { getProvider, resolveProvider, } from "../generation/providers/registry";
import { getLogger, } from "../logger";
import { isTelemetryEnabled, record, } from "../telemetry/service";
import type { AuxCallOptions, AuxCallResult, AuxTaskName, } from "./types";

const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_TEMPERATURE = 0.0;
const DEFAULT_MAX_TOKENS = 100;
const AUX_TELEMETRY_EVENT = "aux.call";

function getLog() {
  return getLogger().child({ module: "aux-pipeline", },);
}

/**
 * Call the auxiliary model with the shared AUX policy.
 *
 * Resolves the model role, threads BYO apiKey (user → chat/actor → server),
 * applies a hard timeout, and records telemetry for every call.
 *
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
    role = "auxiliary",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    userId,
    chatId,
  } = opts;

  // Resolve the model role → provider/model (DB override → config → default)
  const auxRole = await resolveModelRole(role, config, db,);
  if (!auxRole.provider || !auxRole.model) {
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
        model: auxRole.model,
        provider: auxRole.provider,
        latencyMs: Date.now() - startedAt,
        success,
        ...extra,
      },
    },);
  };

  try {
    const response = await withTimeout(
      provider.complete({
        model: auxRole.model,
        messages,
        apiKey,
        params: { temperature, maxTokens, },
      },),
      timeoutMs,
    );

    if (!response) {
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
 */
function withTimeout<T,>(promise: Promise<T>, ms: number,): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve,) => {
    timer = setTimeout(() => resolve(null,), ms,);
    timer.unref?.();
  },);
  return Promise.race([promise, timeout,],).finally(() => {
    if (timer) { clearTimeout(timer,); }
  },);
}
