// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { MaterialRequirement, } from "./types";

export async function findMissingMaterials(
  database: Kysely<DB>,
  actorId: string,
  requirements: MaterialRequirement[],
): Promise<string[]> {
  if (requirements.length === 0) { return []; }
  const rows = await database
    .selectFrom("actor_items",)
    .select(["name", "quantity",],)
    .where("actor_id", "=", actorId,)
    .execute();
  const available = new Map<string, number>();
  for (const row of rows) {
    available.set(row.name, (available.get(row.name,) ?? 0) + row.quantity,);
  }
  return requirements
    .filter((requirement,) => (available.get(requirement.itemName,) ?? 0) < requirement.quantity)
    .map((requirement,) => `${requirement.itemName} x${requirement.quantity}`);
}
