import type { RepetitionDetectionConfig, RepetitionPattern, } from "../types";

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

export function detectPatterns(text: string, config: RepetitionDetectionConfig,): RepetitionPattern[] {
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
