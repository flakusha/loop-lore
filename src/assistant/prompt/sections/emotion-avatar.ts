/**
 * Emotion Avatar Section — injects emotion context into the prompt.
 *
 * When a character has emotion-specific avatars or mood state,
 * this section provides context about the character's current emotional
 * state to the LLM, enabling emotion-aware responses.
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

    if (!emotion && !emotionAvatar) {
      return [];
    }

    const parts: string[] = [];

    if (emotion) {
      parts.push(`Current emotional state: ${emotion}`,);
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
