/**
 * Repetition Detection Service
 *
 * Detects repetitive patterns in streaming LLM output to identify
 * loops and bot-like repetition. Uses n-gram fingerprinting and
 * sliding window similarity comparison.
 */

import type { RepetitionAnalysis, RepetitionDetectionConfig, RepetitionPattern, } from "./types";

// ── Core detection ─────────────────────────────────────────

/**
 * Analyze a text buffer for repetitive patterns.
 * Returns a scored analysis with detected patterns.
 */
export function analyzeRepetition(text: string, config: RepetitionDetectionConfig,): RepetitionAnalysis {
  if (text.length < config.minChars) {
    return {
      detected: false,
      score: 0,
      patterns: [],
      sampleText: text,
    };
  }

  const patterns = detectPatterns(text, config,);
  const score = computeRepetitionScore(patterns,);

  return {
    detected: score >= config.maxSimilarity,
    score,
    patterns,
    sampleText: text.slice(-config.windowSize,),
  };
}

// ── N-gram pattern detection ──────────────────────────────

const NGRAM_SIZE = 10; // Character n-gram size for fingerprinting

interface NGramFingerprint {
  gram: string;
  positions: number[];
}

function extractNGrams(text: string, size: number,): NGramFingerprint[] {
  const fingerprints = new Map<string, number[]>();

  for (let i = 0; i <= text.length - size; i++) {
    const gram = text.slice(i, i + size,).toLowerCase();
    const existing = fingerprints.get(gram,);
    if (existing) {
      existing.push(i,);
    } else {
      fingerprints.set(gram, [i,],);
    }
  }

  const result: NGramFingerprint[] = [];
  for (const [gram, positions,] of fingerprints) {
    result.push({ gram, positions, },);
  }
  return result;
}

function computeNGramSimilarity(positions: number[], windowSize: number, _textLength: number,): number {
  if (positions.length < 2) { return 0; }

  // Calculate average distance between repeated n-grams
  let totalDistance = 0;
  let gaps = 0;
  for (let i = 1; i < positions.length; i++) {
    const gap = positions[i]! - positions[i - 1]!;
    if (gap <= windowSize) {
      totalDistance += gap;
      gaps++;
    }
  }

  if (gaps === 0) { return 0; }

  const avgDistance = totalDistance / gaps;

  // Similarity score: inverse of regularity in spacing
  // Tight, regular spacing = high repetition score
  return Math.min(1, Math.max(0, 1 - avgDistance / windowSize,),);
}

function detectPatterns(text: string, config: RepetitionDetectionConfig,): RepetitionPattern[] {
  const fingerprints = extractNGrams(text, NGRAM_SIZE,);

  // Filter to n-grams that appear multiple times
  const repeatedFingerprints: NGramFingerprint[] = [];
  for (const fp of fingerprints) {
    if (fp.positions.length >= config.minRepetitions) { repeatedFingerprints.push(fp,); }
  }

  if (repeatedFingerprints.length === 0) { return []; }

  const patterns: RepetitionPattern[] = [];

  for (const fp of repeatedFingerprints) {
    const similarity = computeNGramSimilarity(fp.positions, config.windowSize, text.length,);

    if (similarity >= config.maxSimilarity * 0.5) {
      patterns.push({
        text: fp.gram,
        count: fp.positions.length,
        positions: fp.positions,
        similarity,
      },);
    }
  }

  // Sort by similarity (highest first)
  patterns.sort((a, b,) => b.similarity - a.similarity);

  // Deduplicate overlapping patterns
  return deduplicatePatterns(patterns,);
}

function deduplicatePatterns(patterns: RepetitionPattern[],): RepetitionPattern[] {
  const deduped: RepetitionPattern[] = [];
  const seenPositions = new Set<number>();

  for (const pattern of patterns) {
    // Skip if all positions are within already-seen ranges
    const uniquePositions: number[] = [];
    for (const p of pattern.positions) {
      if (!seenPositions.has(p,)) { uniquePositions.push(p,); }
    }
    if (uniquePositions.length < pattern.count * 0.5) { continue; }

    // Mark all positions as seen
    for (const p of pattern.positions) {
      seenPositions.add(p,);
    }

    deduped.push(pattern,);
  }

  return deduped;
}

function computeRepetitionScore(patterns: RepetitionPattern[],): number {
  if (patterns.length === 0) { return 0; }

  // Weighted average: higher weight for patterns with more repetitions
  let totalWeight = 0;
  let weightedScore = 0;

  for (const pattern of patterns) {
    const weight = Math.log2(pattern.count,); // Log scale for repetition count
    weightedScore += pattern.similarity * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.min(1, weightedScore / totalWeight,) : 0;
}

// ── Streaming repetition detection ─────────────────────────

/**
 * Accumulator for real-time repetition detection on streaming text.
 * Maintains a rolling buffer and checks for patterns at intervals.
 */
export class StreamingRepetitionDetector {
  private buffer: string[] = [];
  private totalChars = 0;
  private config: RepetitionDetectionConfig;
  private lastCheckLength = 0;

  constructor(config: RepetitionDetectionConfig,) {
    this.config = config;
  }

  /**
   * Add a chunk of text to the buffer and check for repetition.
   * Returns an analysis if the minimum threshold is met.
   */
  addChunk(chunk: string,): RepetitionAnalysis | null {
    this.buffer.push(chunk,);
    this.totalChars += chunk.length;

    // Only check after crossing the minChars threshold and then every windowSize chars
    if (this.totalChars < this.config.minChars) { return null; }
    if (this.totalChars - this.lastCheckLength < this.config.windowSize / 2) { return null; }

    this.lastCheckLength = this.totalChars;

    const fullText = this.getBufferText();
    const analysis = analyzeRepetition(fullText, this.config,);
    return analysis.detected ? analysis : null;
  }

  getBufferText(): string {
    return this.buffer.join("",);
  }

  getTotalChars(): number {
    return this.totalChars;
  }

  reset(): void {
    this.buffer = [];
    this.totalChars = 0;
    this.lastCheckLength = 0;
  }
}

// ── Utilities ──────────────────────────────────────────────

/**
 * Check if text shows signs of theatrical over-performance
 * (excessive emoting, parentheticals, asterisk actions)
 * which can indicate the model is stuck in a loop.
 */
export function detectTheatricalLoop(text: string,): { detected: boolean; score: number } {
  const lines = text.split("\n",);
  if (lines.length < 6) { return { detected: false, score: 0, }; }

  let actionLineCount = 0;
  let _dialogueLineCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { continue; }

    // Lines wrapped in *action* or (action)
    if (
      (trimmed.startsWith("*",) && trimmed.endsWith("*",)) ||
      (trimmed.startsWith("(",) && trimmed.endsWith(")",))
    ) {
      actionLineCount++;
    } else if (trimmed.includes('"',) || trimmed.includes("\u{201C}",) || trimmed.includes("\u{BB}",)) {
      _dialogueLineCount++;
    }
  }

  let nonBlankCount = 0;
  for (const l of lines) { if (l.trim()) { nonBlankCount++; } }
  if (nonBlankCount === 0) { return { detected: false, score: 0, }; }

  const actionRatio = actionLineCount / nonBlankCount;

  // High action ratio with every line being an action suggests loop behavior
  return {
    detected: actionRatio > 0.8 && actionLineCount > 10,
    score: actionRatio,
  };
}
