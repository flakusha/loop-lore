/**
 * DB Schema Enums — GM Domain
 *
 * Shadow note types and whiteneote types for GM narrative tools.
 */

// ── Shadow Note Types ──────────────────────────────────────
export const ShadowNoteType = {
  Foreshadowing: "foreshadowing",
  Consequence: "consequence",
  HiddenFact: "hidden_fact",
  PlayerMotivation: "player_motivation",
  WorldSecret: "world_secret",
  NarrativeHook: "narrative_hook",
} as const;
export type ShadowNoteType = (typeof ShadowNoteType)[keyof typeof ShadowNoteType];

// ── Whiteneote Types ───────────────────────────────────────
export const WhiteneoteType = {
  NarrativeDirection: "narrative_direction",
  CharacterMotivation: "character_motivation",
  PlotThread: "plot_thread",
  Tone: "tone",
  Pacing: "pacing",
  Theme: "theme",
} as const;
export type WhiteneoteType = (typeof WhiteneoteType)[keyof typeof WhiteneoteType];

// ── Whiteneote Scope ───────────────────────────────────────
export const WhiteneoteScope = {
  Scene: "scene",
  Chapter: "chapter",
  Session: "session",
  World: "world",
} as const;
export type WhiteneoteScope = (typeof WhiteneoteScope)[keyof typeof WhiteneoteScope];
