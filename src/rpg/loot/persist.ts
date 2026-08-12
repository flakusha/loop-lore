/**
 * Loot Persistence Bridge
 *
 * Turns generated `LootDrop[]` into real `world_items` instances so loot can
 * be picked up, traded, or stored. For drops that reference an existing item
 * definition (`entry.itemId`), the instance is created against that
 * definition; anonymous drops get a definition created on-the-fly from the
 * drop's name/type/rarity/metadata.
 */
import type { Kysely, } from "kysely";
import { ItemCategory, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { ItemsService, } from "../../story/items";
import type { LootDrop, LootResult, } from "./types";

/** Where a loot drop should be persisted. */
export interface LootDestination {
  /** World the items belong to. */
  worldId: string;
  /** NPC actor to grant to (giveToNpc). Exclusive with `locationId`. */
  actorId?: string;
  /** Location to place at (placeInLocation). Exclusive with `actorId`. */
  locationId?: string;
  /** Default item category for on-the-fly definitions. */
  defaultCategory?: ItemCategory;
}

/** Map a loose loot `type` string to a unified `ItemCategory`. */
function toCategory(type: string, fallback: ItemCategory,): ItemCategory {
  const value = type.toLowerCase().trim();
  const known = Object.values(ItemCategory,);
  // Map common battle-style names onto canonical categories.
  switch (value) {
    case "weapon":
      return ItemCategory.Weapon;
    case "armor":
    case "helmet":
    case "boots":
    case "gloves":
    case "shield":
      return ItemCategory.Armor;
    case "consumable":
    case "potion":
      return ItemCategory.Consumable;
    case "material":
    case "ingredient":
      return ItemCategory.Material;
    case "key":
    case "key_item":
      return ItemCategory.KeyItem;
    case "quest":
    case "quest_item":
      return ItemCategory.QuestItem;
    case "tool":
      return ItemCategory.Tool;
    case "treasure":
    case "gold":
      return ItemCategory.Treasure;
    case "book":
      return ItemCategory.Book;
    case "artifact":
      return ItemCategory.Artifact;
    case "misc":
      return ItemCategory.Misc;
    default:
      return known.includes(value as ItemCategory) ? (value as ItemCategory) : fallback;
  }
}

/**
 * Persist a set of loot drops as world item instances.
 *
 * Mutates `result` in place, filling `result.worldItemIds`, and returns the
 * same result for convenience.
 */
export async function persistLoot(
  db: Kysely<DB>,
  result: LootResult,
  dest: LootDestination,
): Promise<LootResult> {
  const items = new ItemsService(db,);
  const category = dest.defaultCategory ?? ItemCategory.Other;
  const worldItemIds: string[] = [];

  for (const drop of result.drops) {
    worldItemIds.push(await persistDrop(items, drop, dest, category,),);
  }

  result.worldItemIds = worldItemIds;
  return result;
}

async function persistDrop(
  items: ItemsService,
  drop: LootDrop,
  dest: LootDestination,
  fallbackCategory: ItemCategory,
): Promise<string> {
  // Resolve (or create) the item definition id.
  let definitionId = drop.itemId;
  if (!definitionId) {
    definitionId = await items.createDefinition({
      worldId: dest.worldId,
      name: drop.name,
      description: drop.description,
      category: toCategory(drop.type, fallbackCategory,),
      rarity: drop.rarity,
      stackable: drop.quantity > 1,
      maxStack: Math.max(1, drop.quantity,),
      properties: { ...drop.metadata, loot: true, goldValue: drop.goldValue, },
      value: drop.goldValue,
      weight: 1,
    },);
  }

  // Grant to an NPC or place at a location — a destination is required so
  // drops land somewhere concrete (NPC inventory or a location).
  if (dest.actorId) {
    return items.giveToNpc(definitionId, dest.actorId, dest.worldId, drop.quantity,);
  }
  if (dest.locationId) {
    return items.placeInLocation(definitionId, dest.locationId, dest.worldId, drop.quantity,);
  }
  throw new Error("persistLoot requires actorId or locationId",);
}

export { toCategory, };
