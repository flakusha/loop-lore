// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * In-memory HarnessAcpAdapter fakes for registry/selector tests (test-only;
 * imported exclusively by *.test.ts). No subprocess, no shared state.
 */

import {
  type HarnessAcpAdapter,
  HarnessAcpError,
  type HarnessAdapterFactory,
  type HarnessQuotaSurface,
  type HarnessTurnResult,
  type HarnessUsageReport,
  PermissionDecisionRefusedError,
  type PermissionOutcome,
} from "./adapter-types";
import { answerCarriesDecision, wirePermissionOutcome, } from "./permission-outcome";

/** Knobs for one fake profile connection. */
export interface FakeAdapterSpec {
  /** Models enumerateModels() reports. */
  models: string[];
  /** Prompt calls reject with this kind when set. */
  failPrompt?: HarnessAcpError["kind"];
  /** enumerateModels rejects when set (probe failure). */
  failProbe?: boolean;
  /** Models setModel() rejects with kind `model`. */
  rejectModels?: string[];
  /** Text returned by prompt(). */
  reply?: string;
  /** Reports returned by fetchUsageReports(). */
  usageReports?: HarnessUsageReport[] | null;
  /** The quota surface the fake adapter declares (default "none"). */
  quotaSurface?: HarnessQuotaSurface;
  /** respondPermission refuses the decision, as a harness that cannot express it does. */
  refusePermissions?: boolean;
}

/** Calls made to one fake adapter (asserted by tests). */
export interface FakeAdapterLog {
  setModels: string[];
  prompts: string[];
  /** Outcomes handed to respondPermission. */
  permissions: PermissionOutcome[];
  /** How many times cancel() was called. */
  cancels: number;
  /** How many times close() was called. */
  closes: number;
}

/** Build an adapter + its call log for one spec. */
export function fakeAdapter(spec: FakeAdapterSpec,): { adapter: HarnessAcpAdapter; log: FakeAdapterLog } {
  const log: FakeAdapterLog = { setModels: [], prompts: [], permissions: [], cancels: 0, closes: 0, };
  const adapter: HarnessAcpAdapter = {
    enumerateModels: () => {
      if (spec.failProbe) { return Promise.reject(new HarnessAcpError("spawn", "spawn boom",),); }
      return Promise.resolve(spec.models,);
    },
    setModel: (modelId,) => {
      if (spec.rejectModels?.includes(modelId,)) {
        return Promise.reject(new HarnessAcpError("model", `Unknown ACP model ${modelId}`,),);
      }

      log.setModels.push(modelId,);
      return Promise.resolve();
    },
    prompt: (prompt,) => {
      if (spec.failPrompt) {
        return Promise.reject(new HarnessAcpError(spec.failPrompt, `prompt ${spec.failPrompt} boom`,),);
      }

      log.prompts.push(prompt,);
      const text = spec.reply ?? "ok";
      const result: HarnessTurnResult = {
        text,
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, },
        costUsd: null,
        acpSessionId: "fake-session",
        transcript: { text, thinking: [], toolCalls: [], toolResults: [], },
      };

      return Promise.resolve(result,);
    },
    cancel: () => {
      log.cancels += 1;
      return Promise.resolve();
    },
    fetchUsageReports: () => Promise.resolve(spec.usageReports ?? null,),
    quotaSurface: spec.quotaSurface ?? "none",
    pendingPermission: () => null,
    respondPermission: (outcome,) => {
      log.permissions.push(outcome,);
      if (spec.refusePermissions) {
        // The harness answered, but not with the decision: the tool call is
        // refused and the caller learns the decision did not take effect.
        throw new PermissionDecisionRefusedError({ outcome: "cancelled", },);
      }

      // The fake advertises no options, so it mirrors the production
      // adapter: a decision no advertised option can carry is refused on
      // the wire, and the caller learns the decision did not take effect.
      const answer = wirePermissionOutcome(outcome, [],);
      if (!answerCarriesDecision(answer, outcome, [],)) {
        throw new PermissionDecisionRefusedError(answer,);
      }

      return answer;
    },
    close: () => {
      log.closes += 1;
    },
  };

  return { adapter, log, };
}

/** Build a factory keyed by profile name from specs. */
export function fakeFactory(specs: Record<string, FakeAdapterSpec>,): {
  factory: HarnessAdapterFactory;
  logs: Map<string, FakeAdapterLog>;
} {
  const logs = new Map<string, FakeAdapterLog>();
  const factory: HarnessAdapterFactory = (profile,) => {
    const spec = specs[profile];
    if (!spec) { return Promise.reject(new HarnessAcpError("spawn", `no adapter for ${profile}`,),); }
    const made = fakeAdapter(spec,);
    logs.set(profile, made.log,);
    return made.adapter;
  };

  return { factory, logs, };
}
