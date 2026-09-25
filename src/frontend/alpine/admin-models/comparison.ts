// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "../htmx";
import { jsonBody, } from "../json";

interface ComparisonModel {
  provider: string;
  model: string;
  temperature: string;
  topP: string;
  maxTokens: string;
}
interface ComparisonResult {
  id?: string;
  ratingKey: string;
  model: { provider: string; name: string };
  response: string;
  latencyMs: number;
  tokenCount: number;
  cost: number;
  status: string;
  error?: string;
}
interface ComparisonState {
  comparisonPrompt: string;
  comparisonModels: ComparisonModel[];
  comparisonResults: ComparisonResult[];
  comparisonHistory: {
    id: string;
    prompt: string;
    results: unknown;
    ratings: Record<string, unknown>;
    createdAt: string;
  }[];
  comparisonRatings: Record<string, { rating: number; notes: string }>;
  loadingComparisons: boolean;
  addComparisonModel(): void;
  removeComparisonModel(index: number,): void;
  runComparison(): Promise<void>;
  loadComparisonHistory(): Promise<void>;
  rateComparison(resultIndex: number,): Promise<void>;
}

export const comparisonState: ComparisonState = {
  comparisonPrompt: "",
  comparisonModels: [
    { provider: "", model: "", temperature: "", topP: "", maxTokens: "", },
    { provider: "", model: "", temperature: "", topP: "", maxTokens: "", },
  ] as { provider: string; model: string; temperature: string; topP: string; maxTokens: string }[],
  comparisonResults: [] as ComparisonResult[],
  comparisonHistory: [] as {
    id: string;
    prompt: string;
    results: unknown;
    ratings: Record<string, unknown>;
    createdAt: string;
  }[],
  comparisonRatings: {} as Record<string, { rating: number; notes: string }>,
  loadingComparisons: false,

  addComparisonModel() {
    this.comparisonModels.push({ provider: "", model: "", temperature: "", topP: "", maxTokens: "", },);
  },
  removeComparisonModel(index: number,) {
    if (this.comparisonModels.length > 1) { this.comparisonModels.splice(index, 1,); }
  },
  async runComparison() {
    if (this.loadingComparisons) { return; }
    this.loadingComparisons = true;
    try {
      const models = this.comparisonModels.filter((m,) => m.provider && m.model).map((m,) => ({
        provider: m.provider,
        model: m.model,
        temperature: m.temperature ? Number(m.temperature,) : undefined,
        topP: m.topP ? Number(m.topP,) : undefined,
        maxTokens: m.maxTokens ? Number(m.maxTokens,) : undefined,
      }));
      const res = await apiFetch("/api/v1/generation/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ prompt: this.comparisonPrompt, models, },),
      },);
      if (!res.ok) { return; }
      const data = await res.json() as { id: string; results: ComparisonResult[] };
      this.comparisonResults = data.results.map((result, index,) => ({
        ...result,
        id: data.id,
        ratingKey: String(index,),
      }));
      this.comparisonRatings = {};
      await this.loadComparisonHistory();
    } finally {
      this.loadingComparisons = false;
    }
  },
  async loadComparisonHistory() {
    const res = await apiFetch("/api/v1/comparisons?limit=20", { headers: { Accept: "application/json", }, },);
    if (res.ok) { this.comparisonHistory = (await res.json()).comparisons; }
  },
  async rateComparison(resultIndex: number,) {
    const result = this.comparisonResults[resultIndex];
    const rating = this.comparisonRatings[result?.ratingKey ?? ""];
    if (!result?.id || !rating) { return; }
    await apiFetch(`/api/v1/comparisons/${result.id}/rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(rating,),
    },);
  },
};
