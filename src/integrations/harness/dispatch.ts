// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * dispatch.ts — the production caller of the outbound ACP stack.
 *
 * One dispatch is one gated, attributed, recorded, persisted harness turn:
 *
 * 1. the isolation gate decides — master switch, the caller's admin role, and
 *    the admin-configured profile allowlist (the spawn argv is never the
 *    caller's);
 * 2. the composed runtime's selector runs the turn, pinned to the gated
 *    profile, so the failover walk cannot drift onto another one;
 * 3. the exec log records the run under the `harness` task type with the
 *    profile, tier and ACP session id;
 * 4. the turn's transcript lands as chat rows and its frames reach the chat's
 *    live buffer.
 *
 * Nothing here bypasses the ToS dispatch guard (the selector skips profiles
 * whose greyzone acknowledgement is absent) or the permission queue (the
 * runtime's own factory reports asks into it, and a queued ask blocks the
 * turn until a human decides).
 */

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../db/schema";
import { type TaskType, toHarnessTaskType, } from "../../generation/routing/task-signal";
import { recordExecRun, } from "../../harness/exec-recorder";
import { getChildLogger, type Logger, } from "../../logger";
import { getHarnessAdminFileConfig, } from "./admin-settings";
import { assertHarnessExecution, } from "./isolation-gate";
import { type AttributedTurn, type TurnRequirement, } from "./profile-selector";
import { type HarnessRuntime, } from "./runtime";
import { createHarnessTurnSink, } from "./turn-sink";

/** Logger; null-safe — a dispatch can run beside boot. */
const log = (): Logger | null => getChildLogger("harness-acp",);

/** The routing class every ACP dispatch is classified as. */
const HARNESS_TASK_TYPE: TaskType = "harness";

/** Why a dispatch was refused. Machine-readable, never a thrown string. */
export type HarnessDispatchCode =
  | "harness_disabled"
  | "role_denied"
  | "profile_unknown"
  | "turn_failed";

/** A refused dispatch. */
export class HarnessDispatchError extends Error {
  /** Machine-readable reason. */
  readonly code: HarnessDispatchCode;

  /**
   * @param code - why the dispatch was refused
   * @param message - human-readable detail
   */
  constructor(code: HarnessDispatchCode, message: string,) {
    super(message,);
    this.name = "HarnessDispatchError";
    this.code = code;
  }
}

/** Options for one dispatch. */
export interface DispatchHarnessTurnOptions {
  /** The composed runtime (`getHarnessRuntime()`), never a test-only build. */
  runtime: HarnessRuntime;
  /** The caller's site role; the isolation gate denies anyone else. */
  role: string | null;
  /** The authenticated user the execution is attributed to. */
  userId: string | null;
  /** The admin-configured profile to run. */
  profile: string;
  /** The prompt the harness works on. */
  prompt: string;
  /** The database the turn's rows land in. */
  database: Kysely<DB>;
  /** The chat the turn's rows belong to. */
  chatId: string;
  /** The actor the turn's rows are attributed to. */
  actorId: string;
  /** Tier preference; absent → the selector's task-type default. */
  tier?: TurnRequirement["preferredTier"];
  /** Correlation id for the exec-log line and the rows' idempotency key. */
  turnKey?: string;
}

/** What one dispatch produced. */
export interface DispatchHarnessTurnOutcome {
  /** The finished turn, attributed to its profile, tier and model. */
  turn: AttributedTurn;
  /** The assistant row the turn landed in. */
  messageId: string;
}

/**
 * Run one harness turn end to end: gate, run, record, persist.
 * @param options - the gated profile, the prompt, and the chat binding
 * @returns the finished turn and the assistant row it landed in
 * @throws {HarnessDispatchError} when the gate refuses or the turn fails.
 */
export async function dispatchHarnessTurn(
  options: DispatchHarnessTurnOptions,
): Promise<DispatchHarnessTurnOutcome> {
  const gate = assertHarnessExecution({
    // The gate reads the whole `harness` section; the admin store keeps the
    // `acp` sub-config.
    config: { acp: getHarnessAdminFileConfig(), },
    role: options.role,
    userId: options.userId,
    profileName: options.profile,
  },);

  if (!gate.allowed) {
    log()?.warn("harness dispatch refused", { code: gate.code, profile: options.profile, },);
    throw new HarnessDispatchError(gate.code, gate.message,);
  }

  const turnKey = options.turnKey ?? randomUUID();
  const requirement: TurnRequirement = {
    taskType: HARNESS_TASK_TYPE,
    needsCapabilities: [],
    // Pinned: the profile the gate cleared is the profile that runs.
    profile: options.profile,
    ...(options.tier ? { preferredTier: options.tier, } : {}),
  };

  const run = {
    taskType: toHarnessTaskType(HARNESS_TASK_TYPE,),
    task: options.prompt.replace(/\s+/g, " ",).trim().slice(0, 200,),
    profile: options.profile,
    turnId: turnKey,
  };

  const startedAt = Date.now();
  let attributed: AttributedTurn;
  try {
    attributed = await options.runtime.selector.runTurn(
      requirement,
      options.prompt,
      options.runtime.factory,
    );
  } catch (error) {
    recordExecRun({
      ...run,
      model: "",
      runMs: Date.now() - startedAt,
      result: "error",
      error: (error as Error).message,
    },);

    throw new HarnessDispatchError("turn_failed", (error as Error).message,);
  }

  const { result, } = attributed;
  recordExecRun({
    ...run,
    model: attributed.model,
    runMs: Date.now() - startedAt,
    result: "ok",
    usage: result.usage
      ? { promptTokens: result.usage.inputTokens, completionTokens: result.usage.outputTokens, }
      : undefined,
    tools: result.transcript.toolCalls.map((call,) => call.name),
    profile: attributed.profile,
    tier: attributed.tier,
    acpSessionId: result.acpSessionId,
    msg: result.stopReason,
  },);

  const sink = createHarnessTurnSink({
    database: options.database,
    chatId: options.chatId,
    actorId: options.actorId,
    profile: attributed.profile,
  },);

  const persisted = await sink.onTurnResolved(result, turnKey,);

  return { turn: attributed, messageId: persisted.assistantMessageId, };
}
