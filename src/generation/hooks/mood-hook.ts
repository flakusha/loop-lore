/**
 * Mood Hook — Detects mood shifts in content and fires mood delta events.
 *
 * Uses the LLM to analyze content for mood indicators and emits
 * mood shift events that downstream systems (emotion avatar, mood UI)
 * can react to.
 */

import { getLogger, } from "../../logger";
import type { HookContext, HookEventType, HookHandler, HookResult, } from "./types";

export class MoodHook implements HookHandler {
  readonly name = "mood";
  readonly eventTypes: HookEventType[] = ["mood_shift",];

  async canHandle(_content: string, _context: HookContext,): Promise<boolean> {
    return _content.length > 10;
  }

  async execute(content: string, _context: HookContext,): Promise<HookResult> {
    const log = getLogger();
    log.debug("mood-hook: analyzing content for mood shifts", { contentLength: content.length, },);

    const moodIndicators = this.detectMoodIndicators(content,);
    if (moodIndicators.length === 0) {
      return { handled: false, eventType: "mood_shift", };
    }

    const dominantMood = this.determineDominantMood(moodIndicators,);
    const delta = this.calculateMoodDelta(dominantMood,);

    log.info("mood-hook: detected mood shift", { dominantMood, delta, },);

    return {
      handled: true,
      eventType: "mood_shift",
      data: { dominantMood, delta, indicators: moodIndicators, },
    };
  }

  private detectMoodIndicators(content: string,): string[] {
    const indicators: string[] = [];
    const lower = content.toLowerCase();

    const positiveWords = [
      "happy",
      "joy",
      "delighted",
      "ecstatic",
      "pleased",
      "grateful",
      "thankful",
      "excited",
      "cheerful",
      "glad",
    ];
    const negativeWords = [
      "sad",
      "angry",
      "frustrated",
      "disappointed",
      "upset",
      "miserable",
      "depressed",
      "anxious",
      "worried",
      "fearful",
    ];
    const neutralWords = ["calm", "neutral", "indifferent", "bored", "tired", "exhausted", "relaxed", "peaceful",];

    for (const word of positiveWords) {
      if (lower.includes(word,)) { indicators.push(`positive:${word}`,); }
    }
    for (const word of negativeWords) {
      if (lower.includes(word,)) { indicators.push(`negative:${word}`,); }
    }
    for (const word of neutralWords) {
      if (lower.includes(word,)) { indicators.push(`neutral:${word}`,); }
    }

    return indicators;
  }

  private determineDominantMood(indicators: string[],): string {
    let positive = 0;
    for (const i of indicators) { if (i.startsWith("positive:",)) { positive += 1; } }
    let negative = 0;
    for (const i of indicators) { if (i.startsWith("negative:",)) { negative += 1; } }
    let neutral = 0;
    for (const i of indicators) { if (i.startsWith("neutral:",)) { neutral += 1; } }

    if (positive >= negative && positive >= neutral) { return "positive"; }
    if (negative >= positive && negative >= neutral) { return "negative"; }
    return "neutral";
  }

  private calculateMoodDelta(mood: string,): number {
    switch (mood) {
      case "positive": {
        return 5;
      }
      case "negative": {
        return -5;
      }
      default: {
        return 0;
      }
    }
  }
}
