/**
 * Event Application — Item Transfer Handler
 *
 * Applies a WorldEventType.ItemTransfer event: resolves a matching item
 * definition, finds a source instance, and moves quantity to a target
 * actor or location via ItemsService.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import type { ItemsService, } from "../../items";
import type { WorldEvent, } from "../../types";

export async function applyItemTransfer(
  db: Kysely<DB>,
  itemsService: ItemsService,
  worldId: string,
  event: WorldEvent,
): Promise<void> {
  const itemName = event.data.itemName as string | undefined;
  if (!itemName) { return; }

  const fromActorId = event.data.fromActorId as string | null | undefined;
  const toActorId = event.data.toActorId as string | null | undefined;
  const quantity = Math.max(1, Number(event.data.quantity,) || 1,);

  // Resolve the item definition — exact (case-insensitive) match first,
  // then a single unambiguous fuzzy match, to avoid picking an arbitrary
  // row when several defs share a prefix/name fragment.
  const exact = await db
    .selectFrom("items",)
    .select(["id", "name",],)
    .where("world_id", "=", worldId,)
    .where(sql<boolean>`lower(name) = lower(${itemName})`,)
    .executeTakeFirst();

  let def = exact;
  if (!def) {
    const fuzzy = await db
      .selectFrom("items",)
      .select(["id", "name",],)
      .where("world_id", "=", worldId,)
      .where("name", "like", `%${itemName}%`,)
      .limit(2,)
      .execute();
    // Only act when the fuzzy match is unambiguous.
    if (fuzzy.length === 1) { def = fuzzy[0]; }
  }
  if (!def) {
    getLogger().child({ module: "event-apply", },).warn(
      "item_transfer: no unambiguous matching item definition; skipping",
      { worldId, itemName, },
    );
    return;
  }

  // Find a source instance owned by fromActorId in this world.
  let source = null;
  if (fromActorId) {
    source = await db
      .selectFrom("world_items",)
      .select(["id", "quantity",],)
      .where("world_id", "=", worldId,)
      .where("item_id", "=", def.id,)
      .where("owner_actor_id", "=", fromActorId,)
      .executeTakeFirst();
  }
  if (!source && event.locationId) {
    source = await db
      .selectFrom("world_items",)
      .select(["id", "quantity",],)
      .where("world_id", "=", worldId,)
      .where("item_id", "=", def.id,)
      .where("location_id", "=", event.locationId,)
      .executeTakeFirst();
  }
  if (!source) {
    getLogger().child({ module: "event-apply", },).warn(
      "item_transfer: no source instance found; skipping",
      { worldId, itemId: def.id, fromActorId, },
    );
    return;
  }

  // Transfer to the destination actor (or leave at location if no target).
  const toLocation = toActorId ? undefined : (event.locationId ?? undefined);
  await itemsService.transfer(source.id, quantity, toLocation, toActorId ?? undefined,);
}
