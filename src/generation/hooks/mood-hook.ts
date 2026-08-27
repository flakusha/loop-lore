// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mood Hook — Detects mood shifts in content and fires mood delta events.
 *
 * Uses keyword matching (positive / negative / neutral word lists) to
 * score content mood and emits mood-shift events that downstream systems
 * (mood UI, post-store persistence) can react to. LLM-based classification
 * is planned (see TASK-aux-mood-classification.md).
 *
 * Context-aware: skips detection for `privacyLevel === "private"` and
 * amplifies mood delta for NSFW-rated actors (NSFW content tends to carry
 * stronger emotional valence).
 */

import { ContentRating, } from "../../db/enums";
import { getLogger, } from "../../logger";
import { isNsfwRating, } from "../../middleware/nsfw-gate/constants";
import type { HookContext, HookEventType, HookHandler, HookResult, } from "./types";

export class MoodHook implements HookHandler {
  readonly name = "mood";
  readonly eventTypes: HookEventType[] = ["mood_shift",];

  // eslint-disable-next-line @typescript-eslint/require-await -- GenerationHook.canHandle interface requires Promise<boolean>
  async canHandle(content: string, context: HookContext,): Promise<boolean> {
    // Private content opt-out: skip mood detection entirely so private
    // conversations are never analyzed for mood shifts.
    if (context.privacyLevel === "private") { return false; }
    return content.length > 10;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- GenerationHook.execute interface requires Promise<HookResult>
  async execute(content: string, context: HookContext,): Promise<HookResult> {
    const log = getLogger();
    log.debug("mood-hook: analyzing content for mood shifts", {
      contentLength: content.length,
      privacyLevel: context.privacyLevel,
    },);

    const moodIndicators = this.detectMoodIndicators(content,);
    if (moodIndicators.length === 0) {
      return { handled: false, eventType: "mood_shift", };
    }

    const dominantMood = this.determineDominantMood(moodIndicators,);
    const baseDelta = this.calculateMoodDelta(dominantMood,);

    // NSFW-rated actors: content carries stronger emotional valence, so
    // amplify the mood delta. Non-NSFW (SFW) actors use the base delta.
    const isNsfwActor =
      context.actorContentRating !== undefined &&
      isNsfwRating(context.actorContentRating as ContentRating,);
    const delta = isNsfwActor ? Math.round(baseDelta * 1.5) : baseDelta;

    log.info("mood-hook: detected mood shift", {
      dominantMood,
      delta,
      isNsfwActor,
      actorId: context.actorId,
      chatId: context.chatId,
    },);

    return {
      handled: true,
      eventType: "mood_shift",
      data: {
        dominantMood,
        delta,
        indicators: moodIndicators,
        actorId: context.actorId,
        chatId: context.chatId,
      },
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
