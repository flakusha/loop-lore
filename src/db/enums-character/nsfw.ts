// ── NSFW Intimacy Levels ─────────────────────────────────
// ── State Machine ──────────────────────────────────────────
import { createMachine, type StateDef, } from "../state";

export const IntimacyLevel = {
  Strangers: 0,
  Acquaintances: 10,
  Friends: 25,
  CloseFriends: 40,
  RomanticInterest: 55,
  Dating: 70,
  Intimate: 85,
  Soulbonded: 100,
} as const;
export type IntimacyLevel = (typeof IntimacyLevel)[keyof typeof IntimacyLevel];

// ── NSFW Intimacy Action Types ───────────────────────────
export const IntimacyActionType = {
  Verbal: "verbal",
  Physical: "physical",
  Gift: "gift",
  Service: "service",
  Intimate: "intimate",
} as const;
export type IntimacyActionType = (typeof IntimacyActionType)[keyof typeof IntimacyActionType];

// ── NSFW Arousal Levels ──────────────────────────────────
export const ArousalLevel = {
  Calm: "calm",
  MildlyAroused: "mildly_aroused",
  Aroused: "aroused",
  HighlyAroused: "highly_aroused",
  Desperate: "desperate",
  Climax: "climax",
} as const;
export type ArousalLevel = (typeof ArousalLevel)[keyof typeof ArousalLevel];

// ── NSFW Encounter Types ─────────────────────────────────
export const NsfwEncounterType = {
  Romantic: "romantic",
  Passionate: "passionate",
  Experimental: "experimental",
  Dominant: "dominant",
  Submissive: "submissive",
  Public: "public",
  Voyeuristic: "voyeuristic",
  Group: "group",
  Roleplay: "roleplay",
  Rough: "rough",
  Tender: "tender",
} as const;
export type NsfwEncounterType = (typeof NsfwEncounterType)[keyof typeof NsfwEncounterType];

// ── NSFW Encounter Status ────────────────────────────────
export const NsfwEncounterStatus = {
  Active: "active",
  Completed: "completed",
} as const;
export type NsfwEncounterStatus = (typeof NsfwEncounterStatus)[keyof typeof NsfwEncounterStatus];

const nsfwEncounterStatusDef: StateDef<NsfwEncounterStatus> = {
  values: ["active", "completed",] as const,
  initial: "active",
  transitions: {
    active: ["completed",],
    completed: [],
  },
  terminal: ["completed",],
};
export const nsfwEncounterStatusMachine = createMachine(nsfwEncounterStatusDef,);

// ── NSFW Content Intensity ───────────────────────────────
export const ContentIntensity = {
  Vanilla: "vanilla",
  Mild: "mild",
  Moderate: "moderate",
  Intense: "intense",
  Extreme: "extreme",
} as const;
export type ContentIntensity = (typeof ContentIntensity)[keyof typeof ContentIntensity];

// ── NSFW Narrative Style ─────────────────────────────────
export const NarrativeStyle = {
  FadeToBlack: "fade_to_black",
  Implied: "implied",
  Explicit: "explicit",
  Literary: "literary",
} as const;
export type NarrativeStyle = (typeof NarrativeStyle)[keyof typeof NarrativeStyle];

// ── NSFW Seduction Skill Categories ──────────────────────
export const SeductionSkillCategory = {
  Foreplay: "foreplay",
  Oral: "oral",
  Penetrative: "penetrative",
  Manual: "manual",
  Massage: "massage",
  Striptease: "striptease",
  DirtyTalk: "dirty_talk",
  Roleplay: "roleplay",
  Dominance: "dominance",
  Submission: "submission",
  Aftercare: "aftercare",
  Communication: "communication",
} as const;
export type SeductionSkillCategory = (typeof SeductionSkillCategory)[keyof typeof SeductionSkillCategory];

// ── NSFW Fantasy Categories ──────────────────────────────
export const FantasyCategory = {
  PowerExchange: "power_exchange",
  Exhibitionism: "exhibitionism",
  Voyeurism: "voyeurism",
  Roleplay: "roleplay",
  Sensation: "sensation",
  Group: "group",
  Taboo: "taboo",
  Transformation: "transformation",
  Worship: "worship",
  PetPlay: "pet_play",
  Breeding: "breeding",
  PainPlay: "pain_play",
  Bondage: "bondage",
  Service: "service",
  Degradation: "degradation",
  Praise: "praise",
} as const;
export type FantasyCategory = (typeof FantasyCategory)[keyof typeof FantasyCategory];

// ── NSFW Body Build ──────────────────────────────────────
export const BodyBuild = {
  Slim: "slim",
  Athletic: "athletic",
  Average: "average",
  Curvy: "curvy",
  Muscular: "muscular",
  Heavy: "heavy",
} as const;
export type BodyBuild = (typeof BodyBuild)[keyof typeof BodyBuild];

// ── NSFW Size Category ───────────────────────────────────
export const SizeCategory = {
  Petite: "petite",
  Small: "small",
  Average: "average",
  Large: "large",
  Massive: "massive",
} as const;
export type SizeCategory = (typeof SizeCategory)[keyof typeof SizeCategory];

// ── NSFW Heat Phase ──────────────────────────────────────
export const HeatPhase = {
  Normal: "normal",
  PreHeat: "pre_heat",
  Heat: "heat",
  PostHeat: "post_heat",
} as const;
export type HeatPhase = (typeof HeatPhase)[keyof typeof HeatPhase];

// ── NSFW Location Type ───────────────────────────────────
export const NsfwLocationType = {
  Bedroom: "bedroom",
  Bathroom: "bathroom",
  Kitchen: "kitchen",
  LivingRoom: "living_room",
  Dungeon: "dungeon",
  Tavern: "tavern",
  Alley: "alley",
  Forest: "forest",
  Beach: "beach",
  HotSpring: "hot_spring",
  Carriage: "carriage",
  Garden: "garden",
  Balcony: "balcony",
  Library: "library",
  Office: "office",
  Workshop: "workshop",
} as const;
export type NsfwLocationType = (typeof NsfwLocationType)[keyof typeof NsfwLocationType];
