/**
 * GM configuration persisted on a chat's `gm_config` JSON blob.
 * Mirrors the backend `src/chat/types.ts` `GmConfig` plus the VN display
 * keys the chat settings modal persists (`chat-settings.ts`).
 */
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
}
