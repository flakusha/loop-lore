/**
 * Quality Evaluator Service
 *
 * Scores LLM-generated story responses across six dimensions.
 * For v1, uses heuristic-based scoring with rule checks.
 * Future: delegate to a dedicated LLM with structured output.
 */
import { QualityDimension } from "../db/enums";
import { DEFAULT_QUALITY_THRESHOLDS, DEFAULT_QUALITY_WEIGHTS } from "./types";
import type { QualityScores, QualityEvaluation, QualityThresholds, StoryContext } from "./types";

// ── Scoring Config ───────────────────────────────────────────

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
  weights: { ...DEFAULT_QUALITY_WEIGHTS },
};

// ── Quality Evaluator ────────────────────────────────────────

export class QualityEvaluator {
  private readonly config: EvaluatorConfig;

  // ── Private scoring ──────────────────────────────────────────

  private computeScores(params: EvaluateParams): QualityScores {
    const { response, prompt, actorName, context } = params;
    const characterVoice = this.scoreCharacterVoice(response, actorName);
    const plotCoherence = this.scorePlotCoherence(response, prompt);
    const loreConsistency = this.scoreLoreConsistency(response, context?.world.lore);
    const narrativeQuality = this.scoreNarrativeQuality(response);
    const questRelevance = this.scoreQuestRelevance(response, context?.activeQuests);
    const creativity = this.scoreCreativity(response, context?.recentTurns);

    const overall = Math.round(
      characterVoice * this.config.weights.character_voice +
        plotCoherence * this.config.weights.plot_coherence +
        loreConsistency * this.config.weights.lore_consistency +
        narrativeQuality * this.config.weights.narrative_quality +
        questRelevance * this.config.weights.quest_relevance +
        creativity * this.config.weights.creativity,
    );

    return {
      character_voice: characterVoice,
      plot_coherence: plotCoherence,
      lore_consistency: loreConsistency,
      narrative_quality: narrativeQuality,
      quest_relevance: questRelevance,
      creativity,
      overall,
    };
  }

  // ── Dimension Scorers ─────────────────────────────────────────

  /** Score character voice consistency (0-100) */
  private scoreCharacterVoice(response: string, _actorName: string): number {
    let score = 70;

    const lowerResponse = response.toLowerCase();

    const hasDialogue = response.includes(`"`) || response.includes(`'`);
    const hasAction = /\*.*\*/.test(response);
    const hasFirstPerson = /\b(I|me|my|mine|myself)\b/i.test(response);

    if (hasDialogue) score += 10;
    if (hasAction) score += 5;
    if (hasFirstPerson) score += 5;

    const generic = ["in a voice", "in a tone", "he said", "she said", "they said"];
    for (const phrase of generic) {
      if (lowerResponse.includes(phrase)) score -= 3;
    }

    const wordCount = response.split(/\s+/).length;
    if (wordCount < 15) score -= 15;
    if (wordCount > 500) score -= 5;

    return Math.max(10, Math.min(100, score));
  }

  /** Score plot coherence (0-100) */
  private scorePlotCoherence(response: string, prompt: string): number {
    let score = 65;

    const lowerResponse = response.toLowerCase();
    const lowerPrompt = prompt.toLowerCase();

    const promptWords = new Set<string>();
    for (const w of lowerPrompt.split(/\s+/)) {
      if (w.length > 3) promptWords.add(w);
    }
    const responseWords = lowerResponse.split(/\s+/);
    let matchedWordCount = 0;
    for (const w of responseWords) {
      if (promptWords.has(w)) matchedWordCount++;
    }

    const overlapRatio = matchedWordCount / (promptWords.size || 1);
    if (overlapRatio > 0.3) score += 15;
    else if (overlapRatio > 0.1) score += 5;

    const contradictionPhrases = [
      "but suddenly",
      "however",
      "on the other hand",
      "contrary to",
      "despite this",
    ];
    for (const phrase of contradictionPhrases) {
      if (lowerResponse.includes(phrase)) score -= 2;
    }

    const flowMarkers = [
      "because",
      "since",
      "as a result",
      "therefore",
      "this causes",
      "leading to",
      "in response",
    ];
    let hasFlow = false;
    for (const m of flowMarkers) {
      if (lowerResponse.includes(m)) {
        hasFlow = true;
        break;
      }
    }
    if (hasFlow) score += 10;

    return Math.max(10, Math.min(100, score));
  }

  /** Score lore consistency (0-100) */
   
  private scoreLoreConsistency(response: string, lore?: string | null): number {
    if (!lore) return 75;

    let score = 70;

    const loreLower = lore.toLowerCase();
    const responseLower = response.toLowerCase();

    const loreEntities = this.extractEntities(loreLower);
    const responseEntities = this.extractEntities(responseLower);

    if (loreEntities.size > 0 && responseEntities.size > 0) {
      let matchCount = 0;
      outer: for (const e of responseEntities) {
        for (const le of loreEntities) {
          if (le.includes(e) || e.includes(le)) {
            matchCount++;
            continue outer;
          }
        }
      }
      const matchRatio = matchCount / responseEntities.size;
      if (matchRatio > 0.5) score += 15;
      else if (matchRatio > 0.2) score += 8;
      else if (matchRatio < 0.1 && responseEntities.size > 2) score -= 15;
    }

    return Math.max(10, Math.min(100, score));
  }

  /** Score narrative quality (0-100) */
  private scoreNarrativeQuality(response: string): number {
    let score = 60;

    const wordCount = response.split(/\s+/).length;

    if (wordCount >= 100 && wordCount <= 400) score += 15;
    else if (wordCount >= 50) score += 8;
    else if (wordCount < 20) score -= 20;

    const sensory = [
      "smell",
      "sound",
      "feel",
      "taste",
      "sight",
      "hear",
      "glimmer",
      "echo",
      "fragrant",
      "cold",
      "warm",
      "dark",
    ];
    const lowerResponse = response.toLowerCase();
    let sensoryCount = 0;
    for (const s of sensory) {
      if (lowerResponse.includes(s)) sensoryCount++;
    }
    score += sensoryCount * 3;

    const dialogueCount = (response.match(/[""\u201C\u201D]/g) ?? []).length;
    if (dialogueCount >= 2) score += 8;

    const pastVerbs = (response.match(/\b(was|were|had|did|went|said|walked|looked|turned|spoke)\b/gi) ?? [])
      .length;
    const presentVerbs = (response.match(/\b(is|are|has|do|go|say|walk|look|turn|speak)\b/gi) ?? []).length;
    if (pastVerbs > 0 && presentVerbs > 0) {
      const ratio = pastVerbs / (pastVerbs + presentVerbs);
      if (ratio > 0.8 || ratio < 0.2) score += 5;
      else score -= 5;
    }

    return Math.max(10, Math.min(100, score));
  }

  /** Score quest relevance (0-100) */
  private scoreQuestRelevance(
    response: string,
    quests?: { name: string; progress: number; target: number }[],
  ): number {
    if (!quests || quests.length === 0) return 60;

    let score = 50;
    const responseLower = response.toLowerCase();

    for (const quest of quests) {
      const questWords = quest.name.toLowerCase().split(/\s+/);
      let matchedCount = 0;
      for (const w of questWords) {
        if (w.length > 3 && responseLower.includes(w)) matchedCount++;
      }
      if (matchedCount > 0) {
        score += 10 + (matchedCount / questWords.length) * 10;
      }
    }

    const progressWords = [
      "found",
      "discovered",
      "defeated",
      "rescued",
      "collected",
      "obtained",
      "acquired",
      "completed",
      "progress",
      "quest",
      "objective",
      "goal",
      "mission",
    ];
    const hasProgress = progressWords.some((w) => responseLower.includes(w));
    if (hasProgress) score += 10;

    return Math.max(10, Math.min(100, score));
  }

  /** Score creativity (0-100) */
   
  private scoreCreativity(response: string, recentTurns?: { response: string | null }[]): number {
    let score = 65;

    const lowerResponse = response.toLowerCase();

    const evocativeWords = [
      "unexpected",
      "surprising",
      "peculiar",
      "strange",
      "mysterious",
      "unsettling",
      "beautiful",
      "terrifying",
      "ancient",
      "forgotten",
      "glimmer",
      "shadow",
      "whisper",
      "fade",
      "emerge",
    ];
    let evocativeCount = 0;
    for (const w of evocativeWords) {
      if (lowerResponse.includes(w)) evocativeCount++;
    }
    score += evocativeCount * 5;

    if (recentTurns && recentTurns.length > 0) {
      const lastResponses: string[] = [];
      for (const t of recentTurns) {
        const r = t.response ?? "";
        if (r.length > 50) lastResponses.push(r);
      }

      for (const last of lastResponses) {
        const similarity = this.calculateSimilarity(response, last);
        if (similarity > 0.7) score -= 20;
        else if (similarity > 0.5) score -= 10;
      }
    }

    const cliches = [
      "it was a dark and stormy night",
      "little did they know",
      "the answer was inside them all along",
      "it was all a dream",
      "in the nick of time",
      "destiny called",
    ];
    for (const cliche of cliches) {
      if (lowerResponse.includes(cliche)) score -= 15;
    }

    return Math.max(10, Math.min(100, score));
  }

  // ── Helpers ───────────────────────────────────────────────────

  private extractEntities(text: string): Set<string> {
    const entities = new Set<string>();
    const capitalizedPattern = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3}\b/g;
    const matches = text.match(capitalizedPattern);
    if (matches) {
      for (const match of matches) {
        if (
          ![
            "The",
            "A",
            "An",
            "This",
            "That",
            "These",
            "Those",
            "It",
            "He",
            "She",
            "They",
            "We",
            "You",
            "I",
          ].includes(match)
        ) {
          entities.add(match.toLowerCase());
        }
      }
    }
    return entities;
  }

  private calculateSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    let unionSize = wordsA.size;
    for (const w of wordsB) {
      if (!wordsA.has(w)) unionSize++;
    }
    return unionSize > 0 ? intersection / unionSize : 0;
  }

  constructor(config?: Partial<EvaluatorConfig>) {
    this.config = {
      thresholds: { ...DEFAULT_EVALUATOR_CONFIG.thresholds, ...config?.thresholds },
      weights: { ...DEFAULT_EVALUATOR_CONFIG.weights, ...config?.weights },
    };
  }

  private getReasoning(dimension: string, score: number): string {
    /* eslint-disable unicorn/switch-case-braces */
    if (score >= 80) {
      switch (dimension) {
        case "character_voice":
          return "Strong consistent character voice with natural dialogue";
        case "plot_coherence":
          return "Response logically follows from context";
        case "lore_consistency":
          return "References known world entities correctly";
        case "narrative_quality":
          return "Well-paced prose with sensory detail";
        case "quest_relevance":
          return "Directly addresses active quest objectives";
        case "creativity":
          return "Original and evocative narrative choices";
        default:
          return "Good quality";
      }
    }
    if (score >= 50) {
      switch (dimension) {
        case "character_voice":
          return "Adequate character voice, minor inconsistencies";
        case "plot_coherence":
          return "Generally coherent but some weak connections";
        case "lore_consistency":
          return "Mostly consistent with world lore";
        case "narrative_quality":
          return "Functional prose, could use more detail";
        case "quest_relevance":
          return "Marginally touches on quest elements";
        case "creativity":
          return "Some creative elements but follows expected patterns";
        default:
          return "Acceptable quality";
      }
    }
    switch (dimension) {
      case "character_voice":
        return "Weak or absent character voice";
      case "plot_coherence":
        return "Poor logical connection to prior events";
      case "lore_consistency":
        return "Contradicts or ignores world lore";
      case "narrative_quality":
        return "Flat or confusing prose";
      case "quest_relevance":
        return "Ignores active quest context";
      case "creativity":
        return "Generic or repetitive content";
      default:
        return "Low quality";
    }
    /* eslint-enable unicorn/switch-case-braces */
  }

  /**
   * Evaluate a generated response against the story context.
   * Returns detailed scores and a pass/regenerate/escalate decision.
   */
  evaluate(params: EvaluateParams): QualityEvaluation {
    const { response, prompt, actorName, context } = params;
    const scores = this.computeScores({ response, prompt, actorName, context });
    const overall = scores.overall;

    const details: QualityEvaluation["details"] = {
      character_voice: {
        score: scores.character_voice,
        reasoning: this.getReasoning("character_voice", scores.character_voice),
      },
      plot_coherence: {
        score: scores.plot_coherence,
        reasoning: this.getReasoning("plot_coherence", scores.plot_coherence),
      },
      lore_consistency: {
        score: scores.lore_consistency,
        reasoning: this.getReasoning("lore_consistency", scores.lore_consistency),
      },
      narrative_quality: {
        score: scores.narrative_quality,
        reasoning: this.getReasoning("narrative_quality", scores.narrative_quality),
      },
      quest_relevance: {
        score: scores.quest_relevance,
        reasoning: this.getReasoning("quest_relevance", scores.quest_relevance),
      },
      creativity: {
        score: scores.creativity,
        reasoning: this.getReasoning("creativity", scores.creativity),
      },
    };

    const thresholds = this.config.thresholds;
    let regenerationReason: string | null = null;
    let escalationReason: string | null = null;

    if (overall < thresholds.escalate) {
      escalationReason = `Overall score ${overall} below escalation threshold ${thresholds.escalate}`;
    } else if (overall < thresholds.regenerate) {
      regenerationReason = `Overall score ${overall} below regeneration threshold ${thresholds.regenerate}`;
    }

    let lowest = Infinity;
    for (const d of Object.values(details)) {
      if (d.score < lowest) lowest = d.score;
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
  computeScore(params: EvaluateParams): QualityScores {
    return this.computeScores(params);
  }
}
