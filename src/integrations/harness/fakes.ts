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
  type HarnessTurnResult,
  type HarnessUsageReport,
} from "./adapter-types";

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
}

/** Calls made to one fake adapter (asserted by tests). */
export interface FakeAdapterLog {
  setModels: string[];
  prompts: string[];
}

/** Build an adapter + its call log for one spec. */
export function fakeAdapter(spec: FakeAdapterSpec,): { adapter: HarnessAcpAdapter; log: FakeAdapterLog } {
  const log: FakeAdapterLog = { setModels: [], prompts: [], };
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
      const result: HarnessTurnResult = {
        text: spec.reply ?? "ok",
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, },
        acpSessionId: "fake-session",
      };

      return Promise.resolve(result,);
    },
    fetchUsageReports: () => Promise.resolve(spec.usageReports ?? null,),
    close: () => undefined,
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
