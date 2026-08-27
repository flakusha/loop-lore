// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { RandomEvent, } from "./random-events";

export const EVENT_POOL: Omit<RandomEvent, "id" | "content">[] = [
  { category: "weather", template: "The weather shifts — {weather}.", weight: 3, minMessages: 5, cooldown: 10, },
  { category: "npc", template: "{npc} passes by, glancing briefly.", weight: 2, minMessages: 8, cooldown: 15, },
  {
    category: "npc",
    template: "A distant voice calls out, muffled by the surroundings.",
    weight: 2,
    minMessages: 6,
    cooldown: 12,
  },
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
  { category: "ambient", template: "A {sound} echoes through the area.", weight: 2, minMessages: 5, cooldown: 8, },
  {
    category: "ambient",
    template: "The air carries a faint scent of {scent}.",
    weight: 1,
    minMessages: 7,
    cooldown: 12,
  },
  { category: "social", template: "Nearby, {npc} seems to be in a hurry.", weight: 1, minMessages: 12, cooldown: 20, },
];

export const WEATHER_OPTIONS = [
  "a light drizzle begins to fall",
  "the wind picks up slightly",
  "clouds gather overhead",
  "the sun breaks through the clouds",
  "a chill settles in the air",
  "the temperature rises a few degrees",
  "a gentle fog rolls in",
  "the sky clears to reveal stars",
];

export const SOUND_OPTIONS = [
  "distant clang",
  "muffled shout",
  "birdsong",
  "rustling leaves",
  "flowing water",
  "creaking wood",
  "howling wind",
];

export const SCENT_OPTIONS = [
  "pine and earth",
  "salt and sea",
  "smoke and ash",
  "flowers and rain",
  "dust and old stone",
  "fresh bread",
  "iron and sweat",
];

export const NPC_OPTIONS = [
  "a traveler",
  "a merchant",
  "a guard",
  "a child",
  "an old man",
  "a hooded figure",
];
