/**
 * Generation Types — Results & Analysis
 *
 * Result types for LLM generation output, token usage,
 * repetition analysis, and policy analysis.
 */

import type { PolicyType, PolicyIndicatorType, PolicySeverity, CancelReason, CancelSource } from "../db/enums";

export interface GenerationResult {
  /** The generated content */
  content: string;
  /** Thinking/reasoning content if available */
  thinking?: string;
  /** Token usage */
  tokenUsage: TokenUsage;
  /** Generation time in ms */
  generationTimeMs: number;
  /** Whether generation was cancelled */
  cancelled: boolean;
  /** Cancellation reason if cancelled */
  cancelReason?: CancelReason;
  /** Cancellation source if cancelled */
  cancelSource?: CancelSource;
  /** Number of streaming chunks received */
  streamingChunks?: number;
  /** Number of characters streamed */
  streamingChars?: number;
  /** Repetition score (0-1) if detected */
  repetitionScore?: number;
  /** Repetition analysis details */
  repetitionAnalysis?: RepetitionAnalysis;
  /** Policy analysis details */
  policyAnalysis?: PolicyAnalysis;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
}

export interface RepetitionAnalysis {
  detected: boolean;
  score: number;
  patterns: RepetitionPattern[];
  sampleText: string;
}

export interface RepetitionPattern {
  text: string;
  count: number;
  positions: number[];
  similarity: number;
}

export interface PolicyAnalysis {
  detected: boolean;
  policy: PolicyType;
  confidence: number;
  indicators: PolicyIndicator[];
}

export interface PolicyIndicator {
  type: PolicyIndicatorType;
  description: string;
  severity: PolicySeverity;
}

/** Describes a single step in a multi-step generation pipeline */
export interface GenerationStep {
  /** 0-based step index */
  index: number;
  /** Step name (e.g. 'generate_text', 'generate_image', 'caption') */
  name: string;
  /** Whether this step completed successfully */
  completed: boolean;
  /** Error message if this step failed */
  error?: string;
  /** Result reference (message ID, asset ID, etc.) */
  resultId?: string;
}
