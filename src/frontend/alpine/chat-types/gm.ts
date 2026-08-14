/**
 * GM configuration persisted on a chat's `gm_config` JSON blob.
 * Mirrors the backend `src/chat/types/config.ts` `GmConfig` plus the VN display
 * keys the chat settings modal persists (`chat-settings.ts`).
 */

/** Turn priority level a GM assigns to a participant for the next round. */
export type GmTurnPriority = "high" | "medium" | "low";

/** Narrative guidance a human Game Master applies to a story chat. */
export interface GmGuidance {
  /** Free-form narrative constraints for the next turn (in-character, topic, tone). */
  constraints: string[];
  /** Character the GM wants to respond next. */
  targetCharacter?: string;
  /** Scene description broadcast to all participants. */
  sceneDescription?: string;
  /** Per-participant turn priority for the next round. */
  turnPriority: Record<string, GmTurnPriority>;
}

/** A participant in a GM-guided story, from the user-GM's perspective. */
export interface GmParticipant {
  id: string;
  name: string;
  /** Participant kind — `gm` is the human Game Master. */
  type: "user" | "character" | "assistant" | "gm";
  /** Narrative role within the story. */
  role: "gm" | "player" | "cogm" | "moderator";
  isActive: boolean;
  /** Turn order position. */
  order: number;
}

export interface GmConfig {
  /** Assistant's role in this chat: off, helper, gm, or moderator */
  assistantRole?: "off" | "helper" | "gm" | "moderator";
  /** Visual novel mode (image-heavy, sequential panel display) */
  visualNovel?: boolean;
  /** VN panel layout */
  vnLayout?: "overlay" | "below" | "split";
  /** VN typewriter effect enabled */
  vnTypewriter?: boolean;
  /** VN typewriter speed (chars per frame) */
  vnTypewriterSpeed?: number;
  /** VN scene transition style */
  vnTransition?: "fade" | "cut" | "dissolve" | "slide" | "wipe";
  /** VN auto-advance between scenes */
  vnAutoAdvance?: boolean;
  /** Story-mode flag enabling the human-GM guided-story UX. */
  storyMode?: boolean;
  /** Active human-GM narrative guidance (persisted, mutable at runtime). */
  gmGuidance?: GmGuidance;
  /**
   * Story-mode GM execution type. Omitted → story mode defaults to LLM.
   * Mirrors `GameMasterType` ("llm" | "human" | "hybrid").
   */
  type?: "llm" | "human" | "hybrid";
  /** Human/hybrid GM: the actor acting as the human Game Master. */
  humanGM?: { actorId: string; notifications: boolean };
  /** Hybrid GM: escalation threshold (0–1) for auto-fallback to LLM. */
  escalationThreshold?: number;
}
