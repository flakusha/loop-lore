/**
 * Quality Evaluator Service
 *
 * Scores LLM-generated story responses across six dimensions.
 * For v1, uses heuristic-based scoring with rule checks.
 * Future: delegate to a dedicated LLM with structured output.
 */
import { QualityDimension, } from "../db/enums";
import { getReasoning, } from "./quality/reasoning";
import { SCORERS, } from "./quality/registry";
import type { ScorerContext, } from "./quality/types";
import { DEFAULT_QUALITY_THRESHOLDS, DEFAULT_QUALITY_WEIGHTS, } from "./types";
import type { QualityEvaluation, QualityScores, QualityThresholds, StoryContext, } from "./types";

export interface EvaluatorConfig {
  thresholds: QualityThresholds;
  weights: Record<QualityDimension, number>;
}

export interface EvaluateParams {
  response: string;
  prompt: string;
  actorName: string;
  context?: StoryContext;
}

const DEFAULT_EVALUATOR_CONFIG: EvaluatorConfig = {
  thresholds: DEFAULT_QUALITY_THRESHOLDS,
  weights: { ...DEFAULT_QUALITY_WEIGHTS, },
};

const DIMENSIONS = Object.values(QualityDimension,);

function toScorerContext(params: EvaluateParams,): ScorerContext {
  return {
    response: params.response,
    prompt: params.prompt,
    actorName: params.actorName,
    lore: params.context?.world.lore ?? null,
    quests: params.context?.activeQuests ?? [],
    recentTurns: params.context?.recentTurns ?? [],
  };
}

export class QualityEvaluator {
  private readonly config: EvaluatorConfig;
  private readonly scorers = SCORERS;

  constructor(config?: Partial<EvaluatorConfig>,) {
    this.config = {
      thresholds: { ...DEFAULT_EVALUATOR_CONFIG.thresholds, ...config?.thresholds, },
      weights: { ...DEFAULT_EVALUATOR_CONFIG.weights, ...config?.weights, },
    };
  }

  private computeScores(params: EvaluateParams,): QualityScores {
    const ctx = toScorerContext(params,);
    const scores = {} as Omit<QualityScores, "overall">;
    for (const dim of DIMENSIONS) {
      scores[dim] = this.scorers[dim](ctx,);
    }
    let sum = 0;
    for (const dim of DIMENSIONS) { sum += scores[dim] * this.config.weights[dim]; }
    const overall = Math.round(sum,);
    return { ...scores, overall, };
  }

  private buildDetails(scores: QualityScores,): QualityEvaluation["details"] {
    const details = {} as QualityEvaluation["details"];
    for (const dim of DIMENSIONS) {
      details[dim] = { score: scores[dim], reasoning: getReasoning(dim, scores[dim],), };
    }
    return details;
  }

  /**
   * Evaluate a generated response against the story context.
   * Returns detailed scores and a pass/regenerate/escalate decision.
   */
  evaluate(params: EvaluateParams,): QualityEvaluation {
    const scores = this.computeScores(params,);
    const overall = scores.overall;
    const details = this.buildDetails(scores,);

    const thresholds = this.config.thresholds;
    let regenerationReason: string | null = null;
    let escalationReason: string | null = null;

    if (overall < thresholds.escalate) {
      escalationReason = `Overall score ${overall} below escalation threshold ${thresholds.escalate}`;
    } else if (overall < thresholds.regenerate) {
      regenerationReason = `Overall score ${overall} below regeneration threshold ${thresholds.regenerate}`;
    }

    let lowest = Infinity;
    for (const d of Object.values(details,)) {
      if (d.score < lowest) { lowest = d.score; }
    }
    if (lowest < thresholds.escalate && !escalationReason) {
      escalationReason = `Dimension score ${lowest} below escalation threshold`;
    }

    return {
      scores,
      passed: overall >= thresholds.accept,
      regenerationReason,
      escalationReason,
      details,
    };
  }

  /** Get the raw dimension scores without full evaluation metadata */
  computeScore(params: EvaluateParams,): QualityScores {
    return this.computeScores(params,);
  }
}

export function createQualityEvaluator(config?: Partial<EvaluatorConfig>,): QualityEvaluator {
  return new QualityEvaluator(config,);
}
