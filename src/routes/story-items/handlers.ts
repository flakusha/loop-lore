// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { ItemCategory, ItemRarity, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { ItemsService, } from "../../story/items";
import { safeJsonStringify, } from "../../utils";
import { notFound, } from "../../validation/middleware";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonPaginated, jsonResponse, } from "../http-utils";

/** Validate a value against an enum's values. Returns the value if valid, fallback otherwise. */
export function enumOr<T extends string,>(value: unknown, validValues: readonly T[], fallback: T,): T {
  return typeof value === "string" && (validValues as readonly string[]).includes(value,)
    ? (value as T)
    : fallback;
}

export async function checkWorldOwnership(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldCheck = await database
    .selectFrom("worlds",)
    .select(["owner_id",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  return !(!worldCheck || (userRole !== "admin" && userRole !== "solo" && worldCheck.owner_id !== userId));
}

export async function handleInstances(
  database: Kysely<DB>,
  worldId: string,
  itemId: string,
  userId: string | null,
  userRole: string | null,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
    return jsonError({ message: "Item not found", status: HttpStatus.NotFound, },);
  }

  const instances = await database
    .selectFrom("world_items",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("item_id", "=", itemId,)
    .execute();
  return jsonResponse(instances,);
}

export async function handleDefinition(
  database: Kysely<DB>,
  method: string,
  worldId: string,
  itemId: string,
  userId: string | null,
  userRole: string | null,
  body?: Record<string, unknown>,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
    return jsonError({ message: "Item not found", status: HttpStatus.NotFound, },);
  }

  const items = new ItemsService(database,);

  if (method === "GET") {
    const def = await items.getDefinition(itemId,);
    if (!def) { return notFound("Item not found",); }
    return jsonResponse(def,);
  }

  const updates: Record<string, unknown> = {};
  if (body?.name != null) { updates.name = body.name; }
  if (body?.description != null) { updates.description = body.description; }
  if (body?.category != null) { updates.category = body.category; }
  if (body?.rarity != null) { updates.rarity = body.rarity; }
  if (body?.value != null) { updates.value = body.value; }
  if (body?.weight != null) { updates.weight = body.weight; }
  if (body?.properties != null) {
    const r = safeJsonStringify(body.properties,);
    if (r.ok) { updates.properties = r.value; }
  }
  updates.updated_at = new Date().toISOString();
  await database
    .updateTable("items",)
    .set(updates,)
    .where("id", "=", itemId,)
    .where("world_id", "=", worldId,)
    .execute();

  const updated = await items.getDefinition(itemId,);
  return jsonResponse(updated,);
}

export async function handleDeleteDefinition(
  database: Kysely<DB>,
  worldId: string,
  itemId: string,
  userId: string | null,
  userRole: string | null,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
    return jsonError({ message: "Item not found", status: HttpStatus.NotFound, },);
  }

  await database.deleteFrom("world_items",).where("item_id", "=", itemId,).execute();
  await database.deleteFrom("items",).where("id", "=", itemId,).where("world_id", "=", worldId,).execute();
  return jsonNoContent();
}

export async function handleDefinitions(
  database: Kysely<DB>,
  method: string,
  worldId: string,
  userId: string | null,
  userRole: string | null,
  page: number,
  pageSize: number,
  category?: string,
  body?: Record<string, unknown>,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
    return jsonError({ message: "World not found", status: HttpStatus.NotFound, },);
  }

  const items = new ItemsService(database,);
  if (method === "GET") {
    const allDefs = await items.listDefinitions(
      worldId,
      category ? enumOr(category, Object.values(ItemCategory,), "other",) : undefined,
    );
    const total = allDefs.length;
    const paged = allDefs.slice((page - 1) * pageSize, page * pageSize,);
    return jsonPaginated({ data: paged, total, page, pageSize, },);
  }

  if (!body?.name) { return jsonError({ message: "name is required", status: HttpStatus.BadRequest, },); }
  const id = await items.createDefinition({
    worldId,
    name: body.name as string,
    description: (body.description as string) ?? "",
    category: enumOr(body.category, Object.values(ItemCategory,), "other",),
    rarity: enumOr(body.rarity, Object.values(ItemRarity,), "common",),
    stackable: (body.stackable as boolean) ?? false,
    maxStack: (body.maxStack as number) ?? 1,
    properties: (body.properties as Record<string, unknown>) ?? {},
    value: (body.value as number) ?? 0,
    weight: (body.weight as number) ?? 0,
  },);
  return jsonCreated({ id, },);
}

export async function handleTransfer(
  database: Kysely<DB>,
  worldId: string,
  instanceId: string,
  userId: string | null,
  userRole: string | null,
  body?: Record<string, unknown>,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
    return jsonError({ message: "Item instance not found", status: HttpStatus.NotFound, },);
  }

  const items = new ItemsService(database,);
  const quantity = (body?.quantity as number) ?? 1;
  const result = await items.transfer(
    instanceId,
    quantity,
    (body?.toLocationId as string) ?? undefined,
    (body?.toActorId as string) ?? undefined,
  );
  return jsonResponse(result,);
}

export async function handleInstance(
  database: Kysely<DB>,
  worldId: string,
  instanceId: string,
  userId: string | null,
  userRole: string | null,
) {
  if (!(await checkWorldOwnership(database, worldId, userId, userRole,))) {
    return jsonError({ message: "Item instance not found", status: HttpStatus.NotFound, },);
  }

  const items = new ItemsService(database,);
  await items.destroy(instanceId,);
  return jsonNoContent();
}
