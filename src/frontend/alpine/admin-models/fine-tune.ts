// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { parseParamSizeOr, } from "./shared";
import type { FineTuneCandidate, ModelsState, } from "./types";

/**
 * Fine-tuning metadata state.
 *
 * Surfaces per-model metadata that operators need to pick a base model for
 * fine-tuning (parameter size, context window, modalities) and flags that
 * automated training dispatch is not yet wired to any provider.
 *
 * Reads only already-loaded state (`providers` / `providerModels` /
 * `modelCapabilities`); performs no network calls of its own.
 */
export const fineTuneState: Partial<ModelsState> & ThisType<ModelsState> = {
  /** Constant: no provider exposes an automated fine-tune/train dispatch yet. */
  trainingDispatchWired: false,

  /**
   * Flatten every discovered model into a deduplicated fine-tune candidate
   * row. Capability-registry rows are authoritative; raw discovered models
   * fill gaps.
   */
  fineTuneCandidates(): FineTuneCandidate[] {
    const seen = new Map<
      string,
      {
        provider: string;
        model: {
          id: string;
          paramSize?: string;
          contextWindow?: number;
          maxOutput?: number;
          modalities?: string[];
          thinking?: boolean;
          toolCalling?: boolean;
          ownedBy?: string;
        };
      }
    >();
    const providers = this.providers ?? [];
    for (const p of providers) {
      const models = this.providerModels[p.name] ?? [];
      for (const m of models) {
        seen.set(`${p.name}/${m.id}`, { provider: p.name, model: m, },);
      }
    }
    const capabilities = this.modelCapabilities ?? [];
    for (const cap of capabilities) {
      if (!seen.has(`${cap.providerId}/${cap.modelId}`,)) {
        seen.set(`${cap.providerId}/${cap.modelId}`, {
          provider: cap.providerId,
          model: {
            id: cap.modelId,
            paramSize: cap.paramSize ?? undefined,
            contextWindow: cap.contextWindow ?? undefined,
            maxOutput: cap.maxOutput ?? undefined,
            modalities: cap.modalities,
            thinking: cap.supportsThinking,
            toolCalling: cap.supportsTools,
            ownedBy: cap.ownedBy ?? undefined,
          },
        },);
      }
    }
    const out: FineTuneCandidate[] = [];
    for (const { provider, model, } of seen.values()) {
      out.push({
        provider,
        model: model.id,
        paramSize: model.paramSize ?? null,
        contextWindow: model.contextWindow ?? null,
        maxOutput: model.maxOutput ?? null,
        modalities: model.modalities ?? [],
        thinking: !!model.thinking,
        toolCalling: !!model.toolCalling,
        ownedBy: model.ownedBy ?? null,
      },);
    }
    return out.sort((a, b,) => `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`,));
  },

  /**
   * Readiness of a model as a fine-tune base, derived from real metadata.
   * @param c
   */
  fineTuneReadiness(c: FineTuneCandidate,): string {
    const size = c.paramSize ? parseParamSizeOr(c.paramSize, Number.NaN,) : Number.NaN;
    const ctx = c.contextWindow ?? 0;
    if (!Number.isNaN(size,) && size >= 8) {
      return "Suitable base — large param count";
    }
    if (ctx >= 32_000) {
      return "Suitable base — large context";
    }
    if (!Number.isNaN(size,) && size >= 3) {
      return "Usable base — mid-size";
    }
    return "Limited base — prefer a larger model";
  },
};
