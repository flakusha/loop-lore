// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lore identity resolution — derive the speaking actor's audience identity
 * (race + professions) for lore scoping, from permanent traits and profession
 * rows. Pure data-fetching; the visibility rules live in `lore/audience.ts`.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { ActorIdentity, } from "../../lore/audience";

/** Wealth of an actor's identity needed for audience scoping. */
export interface LoreIdentityRow {
  trait_name: string;
  trait_value: string;
}

/**
 * Resolve the speaking actor's identity (race + profession traits) for lore
 * audience scoping. Race = permanent trait `species`; profession = permanent
 * traits named `profession`/`class` plus `professions.discipline` rows.
 */
export async function resolveActorIdentity(
  db: Kysely<DB>,
  actorId: string,
  worldId: string | null,
): Promise<ActorIdentity> {
  const identityResults = await Promise.allSettled([
    db
      .selectFrom("character_permanent_traits",)
      .select(["trait_name", "trait_value",],)
      .where("actor_id", "=", actorId,)
      .execute(),
    worldId
      ? db
        .selectFrom("professions",)
        .select("discipline",)
        .where("actor_id", "=", actorId,)
        .where("world_id", "=", worldId,)
        .execute()
      : Promise.resolve([] as { discipline: string }[],),
  ],);
  const traitMetaResult = identityResults[0];
  const professionResult = identityResults[1];
  if (traitMetaResult.status === "rejected") { throw traitMetaResult.reason; }
  if (professionResult.status === "rejected") { throw professionResult.reason; }
  const traits = traitMetaResult.value as LoreIdentityRow[];
  const professionRows = professionResult.value;
  const species = traits.find((t,) => t.trait_name === "species")?.trait_value ?? "human";
  const professions = new Set<string>();
  for (const t of traits) {
    if (t.trait_name === "profession" || t.trait_name === "class") {
      professions.add(t.trait_value,);
    }
  }
  for (const row of professionRows) {
    professions.add(row.discipline,);
  }

  return { race: species, professions: [...professions,], locationId: null, };
}
