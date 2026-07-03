/**
 * Quality Evaluator Service
 *
 * Scores LLM-generated story responses across six dimensions.
 * For v1, uses heuristic-based scoring with rule checks.
 * Future: delegate to a dedicated LLM with structured output.
 */
import { QualityDimension } from "../db/enums";
import type { QualityDimension as QD } from "../db/enums";
import {
  DEFAULT_QUALITY_THRESHOLDS,
  DEFAULT_QUALITY_WEIGHTS,
} from "./types";
import type {
  QualityScores,
  QualityEvaluation,
  QualityThresholds,
  StoryContext,
} from "./types";

// ── Scoring Config ───────────────────────────────────────────

export interface EvaluatorConfig {
  thresholds: QualityThresholds;
  weights: Record<QualityDimension, number>;
}

const DEFAULT_EVALUATOR_CONFIG: EvaluatorConfig = {
  thresholds: DEFAULT_QUALITY_THRESHOLDS,
  weights: { ...DEFAULT_QUALITY_WEIGHTS },
};

// ── Quality Evaluator ────────────────────────────────────────

export class QualityEvaluator {
  private readonly config: EvaluatorConfig;

  constructor(config?: Partial<EvaluatorConfig>) {
    this.config = {
      thresholds: { ...DEFAULT_EVALUATOR_CONFIG.thresholds, ...config?.thresholds },
      weights: { ...DEFAULT_EVALUATOR_CONFIG.weights, ...config?.weights },
    };
  }

  /**
   * Evaluate a generated response against the story context.
   * Returns detailed scores and a pass/regenerate/escalate decision.
   */
  async evaluate(
    response: string,
    prompt: string,
    actorName: string,
    context?: StoryContext,
  ): Promise<QualityEvaluation> {
    const scores = this.computeScores(response, prompt, actorName, context);
    const overall = scores.overall;

    const details: QualityEvaluation["details"] = {
      character_voice: { score: scores.character_voice, reasoning: this.getReasoning("character_voice", scores.character_voice, response, actorName) },
      plot_coherence: { score: scores.plot_coherence, reasoning: this.getReasoning("plot_coherence", scores.plot_coherence, response, prompt) },
      lore_consistency: { score: scores.lore_consistency, reasoning: this.getReasoning("lore_consistency", scores.lore_consistency, response, context?.world.lore) },
      narrative_quality: { score: scores.narrative_quality, reasoning: this.getReasoning("narrative_quality", scores.narrative_quality, response) },
      quest_relevance: { score: scores.quest_relevance, reasoning: this.getReasoning("quest_relevance", scores.quest_relevance, response, context?.activeQuests.map((q) => q.name).join(", ")) },
      creativity: { score: scores.creativity, reasoning: this.getReasoning("creativity", scores.creativity, response) },
    };

    const thresholds = this.config.thresholds;
    let regenerationReason: string | null = null;
    let escalationReason: string | null = null;

    if (overall < thresholds.escalate) {
      escalationReason = `Overall score ${overall} below escalation threshold ${thresholds.escalate}`;
    } else if (overall < thresholds.regenerate) {
      regenerationReason = `Overall score ${overall} below regeneration threshold ${thresholds.regenerate}`;
    }

    const lowest = Math.min(...Object.values(details).map((d) => d.score));
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
  async computeScore(
    response: string,
    prompt: string,
    actorName: string,
    context?: StoryContext,
  ): Promise<QualityScores> {
    return this.computeScores(response, prompt, actorName, context);
  }

  // ── Private scoring ──────────────────────────────────────────

  private computeScores(
    response: string,
    prompt: string,
    actorName: string,
    context?: StoryContext,
  ): QualityScores {
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
  private scoreCharacterVoice(response: string, actorName: string): number {
    let score = 70; // Default baseline

    const lines = response.split("\n").filter((l) => l.trim());

    // Check for dialogue in character's voice
    const hasDialogue = response.includes(`"`) || response.includes(`"`);
    const hasAction = /\*.*\*/.test(response); // Italic actions
    const hasFirstPerson = /\b(I|me|my|mine|myself)\b/i.test(response);

    if (hasDialogue) score += 10;
    if (hasAction) score += 5;
    if (hasFirstPerson) score += 5;

    // Deduct for generic phrases
    const generic = [
      "in a voice", "in a tone", "he said", "she said", "they said",
    ];
    for (const phrase of generic) {
      if (response.toLowerCase().includes(phrase)) score -= 3;
    }

    // Too short responses
    if (response.split(/\s+/).length < 15) score -= 15;
    if (response.split(/\s+/).length > 500) score -= 5;

    return Math.max(10, Math.min(100, score));
  }

  /** Score plot coherence (0-100) */
  private scorePlotCoherence(response: string, prompt: string): number {
    let score = 65;

    // Check if response directly addresses the prompt
    const promptWords = new Set(
      prompt.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
    );
    const responseWords = response.toLowerCase().split(/\s+/);
    const matchedWords = responseWords.filter((w) => promptWords.has(w));

    const overlapRatio = matchedWords.length / promptWords.size;
    if (overlapRatio > 0.3) score += 15;
    else if (overlapRatio > 0.1) score += 5;

    // Check for contradictions
    const contradictionPhrases = [
      "but suddenly", "however", "on the other hand",
      "contrary to", "despite this",
    ];
    for (const phrase of contradictionPhrases) {
      if (response.toLowerCase().includes(phrase)) score -= 2;
    }

    // Check for logical flow markers
    const flowMarkers = [
      "because", "since", "as a result", "therefore",
      "this causes", "leading to", "in response",
    ];
    const hasFlow = flowMarkers.some((m) => response.toLowerCase().includes(m));
    if (hasFlow) score += 10;

    return Math.max(10, Math.min(100, score));
  }

  /** Score lore consistency (0-100) */
  private scoreLoreConsistency(response: string, lore?: string | null): number {
    if (!lore) return 75; // No lore to check against

    let score = 70;

    const loreLower = lore.toLowerCase();
    const responseLower = response.toLowerCase();

    const loreEntities = this.extractEntities(loreLower);
    const responseEntities = this.extractEntities(responseLower);

    if (loreEntities.size > 0 && responseEntities.size > 0) {
      const matches = [...responseEntities].filter((e) =>
        [...loreEntities].some((le) => le.includes(e) || e.includes(le)),
      );
      const matchRatio = matches.length / responseEntities.size;
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

    // Length bonuses
    if (wordCount >= 100 && wordCount <= 400) score += 15;
    else if (wordCount >= 50) score += 8;
    else if (wordCount < 20) score -= 20;

    // Show, don't tell — look for sensory details
    const sensory = [
      "smell", "sound", "feel", "taste", "sight", "hear",
      "glimmer", "echo", "fragrant", "cold", "warm", "dark",
    ];
    const sensoryCount = sensory.filter((s) => response.toLowerCase().includes(s)).length;
    score += sensoryCount * 3;

    // Dialogue presence
    const dialogueCount = (response.match(/["""]/g) ?? []).length;
    if (dialogueCount >= 2) score += 8;

    // Tense consistency (check for switching between past/present)
    const pastVerbs = (response.match(/\b(was|were|had|did|went|said|walked|looked|turned|spoke)\b/gi) ?? []).length;
    const presentVerbs = (response.match(/\b(is|are|has|do|go|say|walk|look|turn|speak)\b/gi) ?? []).length;
    if (pastVerbs > 0 && presentVerbs > 0) {
      const ratio = pastVerbs / (pastVerbs + presentVerbs);
      if (ratio > 0.8 || ratio < 0.2) score += 5; // Consistent tense
      else score -= 5; // Mixed tense
    }

    return Math.max(10, Math.min(100, score));
  }

  /** Score quest relevance (0-100) */
  private scoreQuestRelevance(
    response: string,
    quests?: Array<{ name: string; progress: number; target: number }>,
  ): number {
    if (!quests || quests.length === 0) return 60; // No active quests

    let score = 50;
    const responseLower = response.toLowerCase();

    for (const quest of quests) {
      const questWords = quest.name.toLowerCase().split(/\s+/);
      const matchedWords = questWords.filter((w) => w.length > 3 && responseLower.includes(w));
      if (matchedWords.length > 0) {
        score += 10 + (matchedWords.length / questWords.length) * 10;
      }
    }

    // Check for progress indicators
    const progressWords = [
      "found", "discovered", "defeated", "rescued", "collected",
      "obtained", "acquired", "completed", "progress", "quest",
      "objective", "goal", "mission",
    ];
    const hasProgress = progressWords.some((w) => responseLower.includes(w));
    if (hasProgress) score += 10;

    return Math.max(10, Math.min(100, score));
  }

  /** Score creativity (0-100) */
  private scoreCreativity(
    response: string,
    recentTurns?: Array<{ response: string | null }>,
  ): number {
    let score = 65;

    // Unusual/evocative word usage
    const evocativeWords = [
      "unexpected", "surprising", "peculiar", "strange", "mysterious",
      "unsettling", "beautiful", "terrifying", "ancient", "forgotten",
      "glimmer", "shadow", "whisper", "fade", "emerge",
    ];
    const evocativeCount = evocativeWords.filter((w) => response.toLowerCase().includes(w)).length;
    score += evocativeCount * 5;

    // Penalize repetition of recent responses
    if (recentTurns && recentTurns.length > 0) {
      const lastResponses = recentTurns
        .map((t) => t.response ?? "")
        .filter((r) => r.length > 50);

      for (const last of lastResponses) {
        const similarity = this.calculateSimilarity(response, last);
        if (similarity > 0.7) score -= 20;
        else if (similarity > 0.5) score -= 10;
      }
    }

    // Penalize cliché phrases
    const cliches = [
      "it was a dark and stormy night",
      "little did they know",
      "the answer was inside them all along",
      "it was all a dream",
      "in the nick of time",
      "destiny called",
    ];
    for (const cliche of cliches) {
      if (response.toLowerCase().includes(cliche)) score -= 15;
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
        if (!["The", "A", "An", "This", "That", "These", "Those", "It", "He", "She", "They", "We", "You", "I"].includes(match)) {
          entities.add(match.toLowerCase());
        }
      }
    }
    return entities;
  }

  private calculateSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private getReasoning(dimension: string, score: number, response: string, context?: string): string {
    if (score >= 80) {
      switch (dimension) {
        case "character_voice": return "Strong consistent character voice with natural dialogue";
        case "plot_coherence": return "Response logically follows from context";
        case "lore_consistency": return "References known world entities correctly";
        case "narrative_quality": return "Well-paced prose with sensory detail";
        case "quest_relevance": return "Directly addresses active quest objectives";
        case "creativity": return "Original and evocative narrative choices";
        default: return "Good quality";
      }
    }
    if (score >= 50) {
      switch (dimension) {
        case "character_voice": return "Adequate character voice, minor inconsistencies";
        case "plot_coherence": return "Generally coherent but some weak connections";
        case "lore_consistency": return "Mostly consistent with world lore";
        case "narrative_quality": return "Functional prose, could use more detail";
        case "quest_relevance": return "Marginally touches on quest elements";
        case "creativity": return "Some creative elements but follows expected patterns";
        default: return "Acceptable quality";
      }
    }
    switch (dimension) {
      case "character_voice": return "Weak or absent character voice";
      case "plot_coherence": return "Poor logical connection to prior events";
      case "lore_consistency": return "Contradicts or ignores world lore";
      case "narrative_quality": return "Flat or confusing prose";
      case "quest_relevance": return "Ignores active quest context";
      case "creativity": return "Generic or repetitive content";
      default: return "Low quality";
    }
  }
}