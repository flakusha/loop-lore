// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Local Random Event Generator
 *
 * Injects low-stakes stochastic events to keep chats alive.
 * Events are ambient and non-disruptive: weather changes, NPC activity,
 * environmental shifts, and minor happenings.
 *
 * Designed to be called periodically during long chats to add life
 * without requiring GM intervention.
 *
 * This module is intentionally side-effect free: it does not touch the DB.
 * The caller is responsible for any persistence (planned for the
 * `chat_random_events` table per `TASK-random-encounters-events`) and for
 * routing the resulting `EventRef` into the prompt context window via
 * `injectEvents` on the next turn.
 */
import { uid, } from "../utils";
import { EVENT_POOL, NPC_OPTIONS, SCENT_OPTIONS, SOUND_OPTIONS, WEATHER_OPTIONS, } from "./random-events-pool";
import type { EventRef, } from "./types";

// ── Constants ──────────────────────────────────────────────

/** Default cooldown when caller does not pass `messagesSinceLastEvent`. Effectively means "always eligible". */
const MAX_COOLDOWN_DEFAULT = 999;

/** Approximate characters-per-token for short English prose. Used to convert event content length into `EventRef.tokenCount`. */
const CHARS_PER_TOKEN_ESTIMATE = 4;

/** Map of world-time period → ambient weather phrase. */
const PERIOD_WEATHER: Record<"dawn" | "day" | "dusk" | "night", string> = {
  dawn: "misty",
  day: "clear",
  dusk: "breezy",
  night: "cold",
};

// ── Types ───────────────────────────────────────────────────

/** A random event that can be injected into chat. */
export interface RandomEvent {
  id: string;
  category: "weather" | "npc" | "environmental" | "ambient" | "social";
  /** Template string with {location}, {time}, {actor} placeholders */
  template: string;
  /** Resolved content (placeholders replaced) */
  content: string;
  /** Weight for selection (higher = more likely) */
  weight: number;
  /** Minimum chat length before this event can fire */
  minMessages: number;
  /** Cooldown in messages before this event can fire again */
  cooldown: number;
}

/** A chat participant for `{npc}` placeholder substitution. */
export interface RandomEventParticipant {
  id: string;
  displayName: string;
  role: "user" | "ai";
}

/** Chat location context for `{location}` substitution. */
export interface RandomEventLocation {
  id: string;
  name: string;
  description?: string;
}

/** World-time context for `{weather}` derivation. */
export interface RandomEventWorldTime {
  hour: number;
  period: "dawn" | "day" | "dusk" | "night";
}

/** Options for generating random events. */
export interface RandomEventOpts {
  /** Number of messages in the chat so far */
  messageCount: number;
  /** Messages since last event (cooldown tracking). Defaults to a value that always allows firing. */
  messagesSinceLastEvent?: number;
  /** Chat participants for {npc} substitution. AI roles are preferred; falls back to NPC_OPTIONS pool. */
  participants?: readonly RandomEventParticipant[];
  /** Current location for {location} substitution */
  currentLocation?: RandomEventLocation;
  /** World time for {weather} derivation */
  worldTime?: RandomEventWorldTime;
}

// ── Event Generation ────────────────────────────────────────

/**
 * Generate a random ambient event for the current chat context.
 *
 * Pure function — does NOT touch the DB. The caller decides what to do with
 * the returned event (log it, persist it, inject it on the next turn).
 *
 * @param opts - Event generation options
 * @returns A random event, or undefined if no event should fire
 */
export function generateRandomEvent(opts: RandomEventOpts,): RandomEvent | undefined {
  const {
    messageCount,
    messagesSinceLastEvent = MAX_COOLDOWN_DEFAULT,
    participants,
    currentLocation,
    worldTime,
  } = opts;

  // Filter eligible events (minMessages and cooldown checks)
  const eligible: Omit<RandomEvent, "id" | "content">[] = [];
  for (const event of EVENT_POOL) {
    if (messageCount >= event.minMessages && messagesSinceLastEvent >= event.cooldown) {
      eligible.push(event,);
    }
  }

  if (eligible.length === 0) { return undefined; }

  // Weighted random selection
  let totalWeight = 0;
  for (const event of eligible) { totalWeight += event.weight; }
  let roll = Math.random() * totalWeight;

  let selected = eligible[0]!;
  for (const event of eligible) {
    roll -= event.weight;
    if (roll <= 0) {
      selected = event;
      break;
    }
  }

  // Resolve template placeholders
  const content = resolveTemplate(selected.template, { participants, currentLocation, worldTime, },);

  return {
    id: uid(),
    category: selected.category,
    content,
    cooldown: selected.cooldown,
    minMessages: selected.minMessages,
    template: selected.template,
    weight: selected.weight,
  };
}

/** Options for `resolveTemplate`. */
interface ResolveOpts {
  participants?: readonly RandomEventParticipant[];
  currentLocation?: RandomEventLocation;
  worldTime?: RandomEventWorldTime;
}

/**
 * Resolve template placeholders using the provided context.
 * @param template - The template string with `{npc}`, `{location}`, `{weather}`, `{sound}`, `{scent}`, `{time}` placeholders.
 * @param opts - Optional substitution context.
 */
function resolveTemplate(template: string, opts: ResolveOpts = {},): string {
  const { participants = [], currentLocation, worldTime, } = opts;
  const aiParticipants = participants.filter((participant,) => participant.role === "ai");
  return template
    .replace("{weather}", () => {
      if (worldTime) {
        return PERIOD_WEATHER[worldTime.period] ?? pickRandom(WEATHER_OPTIONS,);
      }
      return pickRandom(WEATHER_OPTIONS,);
    },)
    .replace("{sound}", () => pickRandom(SOUND_OPTIONS,),)
    .replace("{scent}", () => pickRandom(SCENT_OPTIONS,),)
    .replace("{npc}", () => {
      if (aiParticipants.length > 0) { return pickRandom(aiParticipants,).displayName; }
      return pickRandom(NPC_OPTIONS,);
    },)
    .replace("{location}", () => {
      return currentLocation ? currentLocation.name : "the area";
    },)
    .replace("{time}", () => "now",);
}

/**
 * Pick a random element from a readonly array.
 * @param arr - Non-empty array of candidates.
 */
function pickRandom<T,>(arr: readonly T[],): T {
  return arr[Math.floor(Math.random() * arr.length,)]!;
}

/**
 * Convert a `RandomEvent` to an `EventRef` for context-window injection.
 *
 * Pure utility — does NOT mutate the context window. Pair with
 * `injectEvents` (from `chat/context-window`) on the next prompt build to
 * surface the event in the LLM's context.
 * @param event - The random event to convert
 * @returns EventRef compatible with `injectEvents()`
 */
export const randomEventToEventRef = (event: RandomEvent,): EventRef => ({
  content: event.content,
  eventId: event.id,
  tokenCount: Math.ceil(event.content.length / CHARS_PER_TOKEN_ESTIMATE,),
  type: "random",
});
