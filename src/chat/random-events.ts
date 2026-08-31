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
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import { uid, } from "../utils";
import { EVENT_POOL, NPC_OPTIONS, SCENT_OPTIONS, SOUND_OPTIONS, WEATHER_OPTIONS, } from "./random-events-pool";
import type { EventRef, } from "./types";

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

/** Options for generating random events. */
export interface RandomEventOpts {
  db: Kysely<DB>;
  worldId: string;
  locationId?: string;
  /** Number of messages in the chat so far */
  messageCount: number;
  /** Last event ID (for cooldown tracking) */
  lastEventId?: string;
  /** Messages since last event */
  messagesSinceLastEvent?: number;
  /** Chat participants for {npc} substitution */
  participants?: { id: string; displayName: string; role: "user" | "ai" }[];
  /** Current location for {location} substitution */
  currentLocation?: { id: string; name: string; description?: string };
  /** World time for {weather} derivation */
  worldTime?: { hour: number; period: "dawn" | "day" | "dusk" | "night" };
}

// ── Event Generation ────────────────────────────────────────

/**
 * Generate a random ambient event for the current chat context.
 * @param opts - Event generation options
 * @returns A random event, or null if no event should fire
 */
export function generateRandomEvent(opts: RandomEventOpts,): RandomEvent | null {
  const { messageCount, messagesSinceLastEvent = 999, participants, currentLocation, worldTime, } = opts;

  // Filter eligible events (minMessages and cooldown checks)
  const eligible: Omit<RandomEvent, "id" | "content">[] = [];
  for (const e of EVENT_POOL) {
    if (messageCount >= e.minMessages && messagesSinceLastEvent >= e.cooldown) {
      eligible.push(e,);
    }
  }

  if (eligible.length === 0) { return null; }

  // Weighted random selection
  let totalWeight = 0;
  for (const e of eligible) { totalWeight += e.weight; }
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
    template: selected.template,
    content,
    weight: selected.weight,
    minMessages: selected.minMessages,
    cooldown: selected.cooldown,
  };
}

/**
 * Resolve template placeholders with random options.
 */
interface ResolveOpts {
  participants?: { id: string; displayName: string; role: "user" | "ai" }[];
  currentLocation?: { id: string; name: string; description?: string };
  worldTime?: { hour: number; period: "dawn" | "day" | "dusk" | "night" };
}

/**
 * @param template
 * @param opts
 */
function resolveTemplate(template: string, opts: ResolveOpts = {},): string {
  const { participants = [], currentLocation, worldTime, } = opts;
  const aiParticipants = participants.filter((p,) => p.role === "ai");
  return template
    .replace("{weather}", () => {
      if (worldTime) {
        const map: Record<string, string> = { dawn: "misty", day: "clear", dusk: "breezy", night: "cold", };
        return map[worldTime.period] ?? pickRandom(WEATHER_OPTIONS,);
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
 * @param arr
 */
function pickRandom<T,>(arr: readonly T[],): T {
  return arr[Math.floor(Math.random() * arr.length,)]!;
}

/**
 * Convert a RandomEvent to an EventRef for context window injection.
 * @param event - The random event to convert
 * @returns EventRef compatible with injectEvents()
 */
export function randomEventToEventRef(event: RandomEvent,): EventRef {
  return {
    eventId: event.id,
    type: "random",
    content: event.content,
    tokenCount: Math.ceil(event.content.length / 4,),
  };
}
