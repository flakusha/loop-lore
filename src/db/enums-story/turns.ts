// ── Story Turns ───────────────────────────────────────────
// ── State Machine (used by story/synthetic/generator.ts) ────

export const TurnType = {
  CharacterAction: "character_action",
  Narration: "narration",
  GmInjection: "gm_injection",
  QuestUpdate: "quest_update",
  WorldEvent: "world_event",
} as const;
export type TurnType = (typeof TurnType)[keyof typeof TurnType];

export const TurnStatus = {
  Pending: "pending",
  Generating: "generating",
  Evaluating: "evaluating",
  Accepted: "accepted",
  Regenerating: "regenerating",
  Failed: "failed",
  Escalated: "escalated",
} as const;
export type TurnStatus = (typeof TurnStatus)[keyof typeof TurnStatus];
