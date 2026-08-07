/** Type of moderation action */
export type ModerationActionType = "block" | "ban" | "shadow" | "collapse" | "flag";

/** Scope of a moderation action */
export type ModerationScope = "chat" | "blog" | "comment" | "global";

/** A moderation action applied to a user or message */
export interface ModerationAction {
  type: ModerationActionType;
  /** Who is being moderated */
  targetActorId: string;
  /** Scope of the moderation */
  scope: ModerationScope;
  /** Who applied the moderation */
  actorId: string;
  /** Reason for the moderation */
  reason?: string;
  /** Whether this is internal (mod queue) or external (user report) */
  internal: boolean;
}
