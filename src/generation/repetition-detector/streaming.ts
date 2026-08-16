// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { RepetitionAnalysis, RepetitionDetectionConfig, } from "../types";
import { analyzeRepetition, } from "./analyze";

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
