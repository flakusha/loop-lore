// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * create_item — builtin assistant tool for LLM-driven item creation.
 *
 * Item 8 / C3 (creation wizards via assistant tool-calls): the assistant can
 * create an item mid-response via a tool call, mirroring the `/create item`
 * command's insert shape (items table, world-scoped).
 *
 * The execution context (db + actor + chat) is supplied by `executeToolCalls`
 * at generation time; the registered definition is static.
 */
import {
  ItemCategory,
  ItemRarity,
  StackableState,
} from "../../db/enums";
import type { ToolDefinition, ToolResult, } from "../../plugins/types";
import { DuplicateItemDefinitionError, ItemPowerBudgetError, validateItemPower, } from "../../story/items";
import { createDefinition, } from "../../story/items/definitions";
import { jsonStringifyOr, } from "../../utils";
import { resolveWorldId, stringParam, } from "./create-wizard-utils";

/** Canonical tool name. */
export const CREATE_ITEM = "create_item";

/** JSON Schema parameters exposed to the model. */
const PARAMETERS: Record<string, unknown> = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Name of the item.",
    },
    description: {
      type: "string",
      description: "One-paragraph item description.",
    },
    category: {
      type: "string",
      enum: Object.values(ItemCategory,),
      description: "Item category; defaults to other.",
    },
    rarity: {
      type: "string",
      enum: Object.values(ItemRarity,),
      description: "Item rarity; defaults to common.",
    },
    stackable: {
      type: "string",
      enum: ["unique", "stackable",],
      description: "Stackability; defaults to unique.",
    },
    worldId: {
      type: "string",
      description: "World id the item belongs to (defaults to the current chat's world).",
    },
  },
  required: ["name",],
  additionalProperties: false,
};

/**
 * Enum-valued string param validator — returns the value when in the set, else undefined.
 * @param params
 * @param key
 * @param values
 * @param fallback
 */
function enumParam<T extends string,>(
  params: Record<string, unknown>,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const raw = params[key];
  return typeof raw === "string" && values.includes(raw as T,)
    ? (raw as T)
    : fallback;
}

/**
 * The builtin item-creation tool definition. Registered at plugin load time
 * (core origin); executed with per-request context.
 *
 * Two gates run before the row is written: `validateItemPower` rejects an
 * over-budget draft, and a duplicate `(worldId, name, category)` is reported
 * back as a tool error rather than inserting a second row (TASK-055/056).
 * @returns {Promise<ToolResult>}
 * @throws {ItemPowerBudgetError} when the draft exceeds its category budget
 */
export const itemCreationTool: ToolDefinition = {
  name: CREATE_ITEM,
  description:
    "Create a new item in a world. Provide a name (required) and optionally a description, category, rarity, stackability, and world id.",
  parameters: PARAMETERS,
  handler: async (params, ctx,): Promise<ToolResult> => {
    if (!ctx) {
      return { content: '{"error":"create_item requires generation context"}', isError: true, };
    }

    const name = stringParam(params, "name",);
    if (!name) {
      return { content: '{"error":"name is required and must be non-empty"}', isError: true, };
    }

    const description = stringParam(params, "description",);
    const category = enumParam(params, "category", Object.values(ItemCategory,), ItemCategory.Other,);
    const rarity = enumParam(params, "rarity", Object.values(ItemRarity,), ItemRarity.Common,);
    const stackable = enumParam(params, "stackable", ["unique", "stackable",] as const, StackableState.Unique,);
    const worldId = await resolveWorldId(ctx.db, ctx.chatId, stringParam(params, "worldId",),);
    const definition = {
      worldId,
      name,
      description: description ?? "",
      category,
      rarity,
      stackable: stackable === StackableState.Stackable,
      maxStack: stackable === StackableState.Stackable ? 99 : 1,
      properties: {},
      value: 0,
      weight: 1,
    };

    const power = validateItemPower(definition,);
    if (!power.ok) { throw new ItemPowerBudgetError(power.field, power.reason,); }

    let id: string;
    try {
      id = await createDefinition({ db: ctx.db, }, definition,);
    } catch (error) {
      if (error instanceof DuplicateItemDefinitionError) {
        return {
          content: jsonStringifyOr({
            error: "this item already exists",
            existingId: error.existingItemId,
            name,
            worldId,
          },),
          isError: true,
        };
      }
      throw error;
    }

    return {
      content: jsonStringifyOr({ ok: true, id, name, worldId, },),
      metadata: { id, name, worldId, },
    };
  },
};
