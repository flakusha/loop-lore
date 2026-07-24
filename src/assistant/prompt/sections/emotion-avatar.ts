/**
 * Emotion Avatar Section — injects emotion context into the prompt.
 *
 * When a character has emotion-specific avatars or mood state,
 * this section provides context about the character's current emotional
 * state to the LLM, enabling emotion-aware responses.
 *
 * When avatar config is available, provides richer context including
 * intent descriptions from the config-defined emotions.
 */
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

export const emotionAvatarSection: SectionBuilder = {
  name: "emotionAvatar",
  enabled: (ctx,) => {
    return ctx.params.emotion !== undefined || ctx.params.emotionAvatar !== undefined;
  },
  build: (ctx,) => {
    const emotion = ctx.params.emotion;
    const emotionAvatar = ctx.params.emotionAvatar;
    const avatarConfig = ctx.params.avatarConfig;

    if (!emotion && !emotionAvatar) {
      return [];
    }

    const parts: string[] = [];

    if (emotion) {
      parts.push(`Current emotional state: ${emotion}`,);

      // Add intent description from config if available
      if (avatarConfig) {
        const emotionEntry = avatarConfig.emotions[emotion];
        if (emotionEntry) {
          parts.push(`Emotion intent: ${emotionEntry.intent}`,);
        }
      }
    }

    if (emotionAvatar) {
      parts.push(`Emotion avatar asset in use: ${emotionAvatar}`,);
    }

    const content = parts.join(". ",);

    return [
      {
        role: "system",
        content: wrapSection("emotion_context", content,),
      },
    ];
  },
};
