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
}

// ── Event Templates ─────────────────────────────────────────

const EVENT_POOL: Omit<RandomEvent, "id" | "content">[] = [
  // Weather
  {
    category: "weather",
    template: "The weather shifts — {weather}.",
    weight: 3,
    minMessages: 5,
    cooldown: 10,
  },
  // NPC activity
  {
    category: "npc",
    template: "{npc} passes by, glancing briefly.",
    weight: 2,
    minMessages: 8,
    cooldown: 15,
  },
  {
    category: "npc",
    template: "A distant voice calls out, muffled by the surroundings.",
    weight: 2,
    minMessages: 6,
    cooldown: 12,
  },
  // Environmental
  {
    category: "environmental",
    template: "Something creaks in the distance.",
    weight: 1,
    minMessages: 10,
    cooldown: 20,
  },
  {
    category: "environmental",
    template: "The ground vibrates almost imperceptibly.",
    weight: 1,
    minMessages: 15,
    cooldown: 25,
  },
  // Ambient
  {
    category: "ambient",
    template: "A {sound} echoes through the area.",
    weight: 2,
    minMessages: 5,
    cooldown: 8,
  },
  {
    category: "ambient",
    template: "The air carries a faint scent of {scent}.",
    weight: 1,
    minMessages: 7,
    cooldown: 12,
  },
  // Social
  {
    category: "social",
    template: "Nearby, {npc} seems to be in a hurry.",
    weight: 1,
    minMessages: 12,
    cooldown: 20,
  },
];

const WEATHER_OPTIONS = [
  "a light drizzle begins to fall",
  "the wind picks up slightly",
  "clouds gather overhead",
  "the sun breaks through the clouds",
  "a chill settles in the air",
  "the temperature rises a few degrees",
  "a gentle fog rolls in",
  "the sky clears to reveal stars",
];

const SOUND_OPTIONS = [
  "distant clang",
  "muffled shout",
  "birdsong",
  "rustling leaves",
  "flowing water",
  "creaking wood",
  "howling wind",
];

const SCENT_OPTIONS = [
  "pine and earth",
  "salt and sea",
  "smoke and ash",
  "flowers and rain",
  "dust and old stone",
  "fresh bread",
  "iron and sweat",
];

const NPC_OPTIONS = [
  "a traveler",
  "a merchant",
  "a guard",
  "a child",
  "an old man",
  "a hooded figure",
];

// ── Event Generation ────────────────────────────────────────

/**
 * Generate a random ambient event for the current chat context.
 *
 * @param opts - Event generation options
 * @returns A random event, or null if no event should fire
 */
export function generateRandomEvent(
  opts: RandomEventOpts,
): RandomEvent | null {
  const { messageCount, messagesSinceLastEvent = 999, } = opts;

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
  const content = resolveTemplate(selected.template,);

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
function resolveTemplate(template: string,): string {
  return template
    .replace("{weather}", () => pickRandom(WEATHER_OPTIONS,),)
    .replace("{sound}", () => pickRandom(SOUND_OPTIONS,),)
    .replace("{scent}", () => pickRandom(SCENT_OPTIONS,),)
    .replace("{npc}", () => pickRandom(NPC_OPTIONS,),)
    .replace("{location}", () => "the area",)
    .replace("{time}", () => "now",);
}

function pickRandom<T,>(arr: readonly T[],): T {
  return arr[Math.floor(Math.random() * arr.length,)]!;
}

/**
 * Convert a RandomEvent to an EventRef for context window injection.
 *
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
