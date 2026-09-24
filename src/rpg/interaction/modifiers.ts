// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { safeJsonParse, } from "../../utils";
import { abilityModifier, } from "../stats";
import type { AbilityName, } from "../stats/types";
import type { InteractionModifier, } from "./types";

const SKILL_ABILITIES: Record<string, AbilityName> = {
  athletics: "str",
  acrobatics: "dex",
  sleight_of_hand: "dex",
  stealth: "dex",
  arcana: "int",
  history: "int",
  investigation: "int",
  intellect: "int",
  nature: "int",
  religion: "int",
  animal_handling: "wis",
  insight: "wis",
  medicine: "wis",
  perception: "wis",
  survival: "wis",
  charisma: "cha",
  deception: "cha",
  intimidation: "cha",
  performance: "cha",
  persuasion: "cha",
};

export function getInteractionAbility(skill: string,): AbilityName | null {
  return SKILL_ABILITIES[skill.toLowerCase()] ?? null;
}

export async function getAbilityModifier(
  database: Kysely<DB>,
  actorId: string,
  skill: string,
): Promise<InteractionModifier[]> {
  const ability = getInteractionAbility(skill,);
  if (!ability) { return []; }
  const stats = await database
    .selectFrom("character_stats",)
    .select(["str", "dex", "con", "int", "wis", "cha",],)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  if (!stats) { return []; }
  return [{ source: `ability.${ability}`, value: abilityModifier(stats[ability],), },];
}

export function parseInteractionModifiers(value: string | null,): InteractionModifier[] {
  const parsed = safeJsonParse<InteractionModifier[]>(value ?? "[]",);
  return parsed.ok && Array.isArray(parsed.value,) ? parsed.value : [];
}
