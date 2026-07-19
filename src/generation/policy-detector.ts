/**
 * Content Policy Mismatch Detection Service
 *
 * Pluggable detection architecture. The built-in implementation
 * delegates to external moderation services (OpenAI, custom API).
 *
 * For self-hosted / offline use, register a custom detector via
 * `registerPolicyDetector()` at startup.
 */

import { getLogger, } from "../logger";
import type { PolicyAnalysis, PolicyDetectionConfig, } from "./types";

// ── Detector interface ────────────────────────────────────

export interface PolicyDetector {
  /**
   * Unique name for this detector (e.g., 'openai-moderation', 'keyword-filter')
   */
  readonly name: string;

  /**
   * Analyze a text string for policy violations.
   *
   * @param text - The generated text to analyze (full or partial)
   * @param config - Detection configuration
   * @returns A PolicyAnalysis describing any violations found
   */
  analyze(text: string, config: PolicyDetectionConfig,): Promise<PolicyAnalysis>;
}

// ── Detector registry ─────────────────────────────────────

const registeredDetectors: PolicyDetector[] = [];

/**
 * Register a custom policy detector. Detectors run in registration order;
 * the first detector to return `detected: true` short-circuits.
 */
export function registerPolicyDetector(detector: PolicyDetector,): void {
  registeredDetectors.push(detector,);
}

/**
 * Clear all registered detectors. Useful in tests.
 */
export function clearDetectors(): void {
  registeredDetectors.length = 0;
}

// ── Null detector (no-op fallback) ────────────────────────

class NullDetector implements PolicyDetector {
  readonly name = "null";

  analyze(_text: string, _config: PolicyDetectionConfig,): Promise<PolicyAnalysis> {
    return Promise.resolve({
      detected: false,
      policy: _config.expectedPolicy,
      confidence: 0,
      indicators: [],
    },);
  }
}

// Register the null detector by default — no third-party dependency
// Call this explicitly at startup. Export for use in tests.
export function registerDefaultNullDetector(): void {
  registerPolicyDetector(new NullDetector(),);
}

// ── Public API ─────────────────────────────────────────────

/**
 * Detect policy mismatches in generated text.
 * Runs all registered detectors and returns the first positive hit,
 * or the aggregate result if none fire.
 */
export async function detectPolicyMismatch(
  text: string,
  config: PolicyDetectionConfig,
): Promise<PolicyAnalysis> {
  if (!config.enabled || !text) {
    return { detected: false, policy: config.expectedPolicy, confidence: 0, indicators: [], };
  }

  let bestAnalysis: PolicyAnalysis = {
    detected: false,
    policy: config.expectedPolicy,
    confidence: 0,
    indicators: [],
  };

  for (const detector of registeredDetectors) {
    try {
      const analysis = await detector.analyze(text, config,);

      if (analysis.detected) {
        // First positive hit short-circuits
        return analysis;
      }

      // Track the one with highest confidence for aggregated reporting
      if (analysis.confidence > bestAnalysis.confidence) {
        bestAnalysis = analysis;
      }
    } catch (error) {
      getLogger()
        .child({ module: "policy-detector", },)
        .warn(`${detector.name} failed: ${(error as Error).message}`,);
      // Detector failure is non-fatal — continue to next detector
    }
  }

  return bestAnalysis;
}

// ── Example: OpenAI Moderation API detector ────────────────
// Uncomment and configure with OPENAI_API_KEY to use.
// Register at startup: registerPolicyDetector(new OpenAIModerationDetector(apiKey))

/*
export class OpenAIModerationDetector implements PolicyDetector {
  readonly name = "openai-moderation";

  constructor(private readonly apiKey: string) {}

  async analyze(text: string, config: PolicyDetectionConfig): Promise<PolicyAnalysis> {
    const bodyResult = safeJsonStringify({ input: text });
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: bodyResult.ok ? bodyResult.value : "{}",
    });

    if (!response.ok) {
      throw new Error(`OpenAI Moderation API returned ${response.status}`);
    }

    const data = (await response.json()) as {
      results: Array<{
        flagged: boolean;
        categories: Record<string, boolean>;
        category_scores: Record<string, number>;
      }>;
    };

    if (!data.results?.length) {
      return { detected: false, policy: config.expectedPolicy, confidence: 0, indicators: [] };
    }

    const result = data.results[0];
    if (!result.flagged) {
      return { detected: false, policy: config.expectedPolicy, confidence: 0, indicators: [] };
    }

    const flaggedCategories = Object.entries(result.categories)
      .filter(([, flagged]) => flagged)
      .map(([category]) => category);

    const indicators: PolicyIndicator[] = flaggedCategories.map((category) => ({
      type: "semantic",
      description: `OpenAI moderation flagged: ${category}`,
      severity: (result.category_scores?.[category] ?? 0) > 0.8 ? "high" : "medium",
    }));

    const maxScore = Math.max(
      ...flaggedCategories.map((c) => result.category_scores?.[c] ?? 0),
    );

    return {
      detected: true,
      policy: config.expectedPolicy,
      confidence: maxScore,
      indicators,
    };
  }
}
*/

// ── Example: Custom HTTP endpoint detector ─────────────────
// Register at startup with:
//   registerPolicyDetector(new HttpPolicyDetector("https://my-filter.example.com/check"))

/*
export class HttpPolicyDetector implements PolicyDetector {
  readonly name = "http-endpoint";

  constructor(private readonly endpointUrl: string) {}

  async analyze(text: string, config: PolicyDetectionConfig): Promise<PolicyAnalysis> {
    const bodyResult = safeJsonStringify({ text, expectedPolicy: config.expectedPolicy });
    const response = await fetch(this.endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyResult.ok ? bodyResult.value : "{}",
    });

    if (!response.ok) return { detected: false, policy: config.expectedPolicy, confidence: 0, indicators: [] };

    return (await response.json()) as PolicyAnalysis;
  }
}
*/
