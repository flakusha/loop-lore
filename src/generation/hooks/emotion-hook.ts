/**
 * Emotion Hook — Detects emotional content and triggers avatar selection.
 *
 * Uses the LLM to analyze content for emotional indicators and
 * emits emotion change events that trigger avatar selection updates.
 */

import { EmotionType, } from "../../db/enums";
import { getLogger, } from "../../logger";
import type { HookContext, HookEventType, HookHandler, HookResult, } from "./types";

export class EmotionHook implements HookHandler {
  readonly name = "emotion";
  readonly eventTypes: HookEventType[] = ["emotion_change",];

  // eslint-disable-next-line @typescript-eslint/require-await -- GenerationHook.canHandle interface requires Promise<boolean>
  async canHandle(_content: string, _context: HookContext,): Promise<boolean> {
    return _content.length > 10;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- GenerationHook.execute interface requires Promise<HookResult>
  async execute(content: string, _context: HookContext,): Promise<HookResult> {
    const log = getLogger();
    log.debug("emotion-hook: analyzing content for emotional indicators", { contentLength: content.length, },);

    const emotionIndicators = this.detectEmotions(content,);
    if (emotionIndicators.length === 0) {
      return { handled: false, eventType: "emotion_change", };
    }

    const dominantEmotion = this.determineDominantEmotion(emotionIndicators,);

    log.info("emotion-hook: detected emotion shift", { dominantEmotion, },);

    return {
      handled: true,
      eventType: "emotion_change",
      data: { dominantEmotion, indicators: emotionIndicators, },
    };
  }

  private detectEmotions(content: string,): string[] {
    const indicators: string[] = [];
    const lower = content.toLowerCase();

    // Emit canonical EmotionType values (lowercase, e.g. "happy", "sad",
    // "fearful") so the detected dominant emotion maps 1:1 onto the avatar/
    // provider/config emotion key sets. The previous homegrown names
    // (joy/anger/sadness/fear/...) matched nothing downstream.
    const emotions = [
      {
        name: EmotionType.Happy,
        keywords: ["happy", "joy", "delight", "cheerful", "laugh", "smile", "glad", "pleased",],
      },
      { name: EmotionType.Angry, keywords: ["angry", "fury", "rage", "frustrated", "irritated", "mad", "annoyed",], },
      {
        name: EmotionType.Sad,
        keywords: ["sad", "sorrow", "grief", "mourn", "cry", "tear", "depressed", "heartbroken",],
      },
      {
        name: EmotionType.Fearful,
        keywords: ["afraid", "scared", "terrified", "fear", "dread", "anxious", "worried", "nervous",],
      },
      {
        name: EmotionType.Surprised,
        keywords: ["surprised", "shocked", "astonished", "amazed", "astonishing", "unexpected",],
      },
      { name: EmotionType.Disgusted, keywords: ["disgust", "disgusted", "repulsive", "revolting", "nauseating",], },
      {
        name: EmotionType.Loving,
        keywords: ["love", "adore", "devoted", "passionate", "affection", "tender", "warm",],
      },
      // desire/craving/longing → no dedicated EmotionType; fold into excited.
      { name: EmotionType.Excited, keywords: ["desire", "craving", "longing", "yearning", "wanting", "lust",], },
    ];

    for (const emotion of emotions) {
      for (const keyword of emotion.keywords) {
        if (lower.includes(keyword,)) {
          indicators.push(`${emotion.name}:${keyword}`,);
          break;
        }
      }
    }

    return indicators;
  }

  private determineDominantEmotion(indicators: string[],): string {
    const emotionCounts = new Map<string, number>();
    for (const indicator of indicators) {
      const parts = indicator.split(":",);
      const emotion = parts[0] ?? "unknown";
      emotionCounts.set(emotion, (emotionCounts.get(emotion,) ?? 0) + 1,);
    }

    let dominant = "neutral";
    let maxCount = 0;
    for (const [emotion, count,] of emotionCounts) {
      if (count <= maxCount) {
        continue;
      }

      maxCount = count;
      dominant = emotion;
    }

    return dominant;
  }
}
