// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /apply, /add, /clone — deterministic (NO-LLM) entity mutations for epic
 * batch B4 (`epic-assistant-entity-access.md`, Areas 7 + 8).
 *
 * Every command here is preview-only: it parses arguments, checks the SAME
 * guard the underlying HTTP route applies, and returns a preview action the
 * frontend confirms before calling the real route. Nothing is persisted by
 * the command handlers themselves.
 *
 * Scope decisions (v1):
 * - `/apply` kinds: `world`, `location`, `item` — the world-scoped entity
 *   types with existing update routes. `character` is NOT in scope (different
 *   guard surface — `actors.owner_id` ownership, sibling slice owns it).
 * - `/add` kinds: `location`, `item` only. World creation exists via `/create`
 *   (`epic-assistant-gm-flows.md`); character generation is the gm-flows epic.
 * - `/clone` kinds: `location`, `item`. A clone stays in the source's world,
 *   so "ownership of source AND target world ownership" collapses into one
 *   check of the source row's `world_id`.
 * - Guards are the routes' own guards, reused verbatim (no new access layer):
 *   world → `requireWorldOwner` (PUT /api/v1/worlds/:worldId),
 *   location → `requireWorldOwner` (PUT/POST .../locations — row read first
 *   because `world_id` lives on the row),
 *   item → `checkWorldOwnership` (PUT/POST .../items — the story-items guard).
 * - Routes called on confirm (frontend `apply-entity` / `add-entity` /
 *   `clone-entity` handlers in `src/frontend/alpine/chat-actions/dispatch.ts`):
 *   PUT  /api/v1/worlds/:worldId                      (world patch)
 *   PUT  /api/v1/worlds/:worldId/locations/:locId     (location patch)
 *   POST /api/v1/worlds/:worldId/locations            (location add/clone)
 *   PUT  /api/v1/worlds/:worldId/items/:itemId        (item patch)
 *   POST /api/v1/worlds/:worldId/items                (item add/clone)
 */

import {
  DifficultyReroll,
  DifficultyState,
  ItemCategory,
  ItemRarity,
  LocationKind,
  MobilityMode,
  WorldKind,
  WorldVisibility,
} from "../../db/enums";
import { checkWorldOwnership, } from "../../routes/story-items/handlers";
import { requireWorldOwner, } from "../../routes/worlds/access";
import { safeJsonParse, safeJsonStringify, } from "../../utils";
import { type CommandResult, registerCommand, } from "./registry";

// ── Patch grammar ────────────────────────────────────────────

/** Value shapes a patch field may carry. */
type PatchFieldType = "string" | "number" | "boolean" | "json-array" | "json-object";

interface PatchFieldSpec {
  type: PatchFieldType;
  /** Reject `key=""` (used for id-bearing fields like `parentLocationId`). */
  rejectEmpty?: boolean;
  /**
   * When set, a string value must be one of these — derived from the route's
   * coercion tables (`enumOr` in src/routes/story-items/handlers.ts for item
   * category/rarity; the enum-typed columns the world/location routes store
   * raw otherwise). Rejecting here keeps the preview honest: the route would
   * otherwise coerce (item) or store a value the DB enum never meant (world,
   * location), diverging from what the user confirmed.
   */
  allowedValues?: readonly string[];
  /**
   * For `json-object` fields: `effects`, when present, must be a JSON array —
   * `createDefinition` runs `parseItemEffects(def.properties.effects)` outside
   * any try/catch, so a non-array reaches the user as an unhandled 500 AFTER
   * they confirmed. Reject it at parse time instead.
   */
  requireEffectsArray?: boolean;
}

/** Allowed `key=value` fields for one command/kind combination. */
type PatchSpec = Record<string, PatchFieldSpec>;

/** A parsed patch: field → typed value, exactly what the route body accepts. */
export type EntityPatch = Record<string, string | number | boolean | string[] | Record<string, unknown>>;

export type ParseEntityPatchResult =
  | { ok: true; patch: EntityPatch }
  | { ok: false; error: string };

/** `/apply world` — what `handleUpdateWorld` reads from the PUT body. */
const WORLD_APPLY_SPEC: PatchSpec = {
  name: { type: "string", },
  description: { type: "string", },
  lore: { type: "string", },
  kind: { type: "string", allowedValues: Object.values(WorldKind,), },
  visibility: { type: "string", allowedValues: Object.values(WorldVisibility,), },
  difficultyReroll: { type: "string", allowedValues: Object.values(DifficultyReroll,), },
  difficultyState: { type: "string", allowedValues: Object.values(DifficultyState,), },
  scanDepth: { type: "number", },
  tokenBudget: { type: "number", },
  difficultyModifier: { type: "number", },
};

/** `/apply location` / `/clone location` overrides — what `handleUpdateLocation` reads. */
const LOCATION_APPLY_SPEC: PatchSpec = {
  name: { type: "string", },
  description: { type: "string", },
  kind: { type: "string", allowedValues: Object.values(LocationKind,), },
  mobilityMode: { type: "string", allowedValues: Object.values(MobilityMode,), },
  parentLocationId: { type: "string", rejectEmpty: true, },
  coordX: { type: "number", },
  coordY: { type: "number", },
  coordZ: { type: "number", },
  connections: { type: "json-array", },
};

/** `/apply item` — what the PUT item-definition route reads from its body. */
const ITEM_APPLY_SPEC: PatchSpec = {
  name: { type: "string", },
  description: { type: "string", },
  category: { type: "string", allowedValues: Object.values(ItemCategory,), },
  rarity: { type: "string", allowedValues: Object.values(ItemRarity,), },
  value: { type: "number", },
  weight: { type: "number", },
  properties: { type: "json-object", requireEffectsArray: true, },
};

/**
 * `/add location` extras and `/clone location` field overrides — what
 * `handleCreateLocation` reads from the POST body, minus the positional name.
 */
const LOCATION_ADD_SPEC: PatchSpec = {
  description: { type: "string", },
  kind: { type: "string", allowedValues: Object.values(LocationKind,), },
  mobilityMode: { type: "string", allowedValues: Object.values(MobilityMode,), },
  parentLocationId: { type: "string", rejectEmpty: true, },
  coordX: { type: "number", },
  coordY: { type: "number", },
  coordZ: { type: "number", },
  connections: { type: "json-array", },
};

/**
 * `/add item` extras and `/clone item` field overrides — what the POST
 * item-definitions route reads, minus the positional name. `stackable` and
 * `maxStack` are accepted but `/clone` never copies them from the source row:
 * the route casts `body.stackable` to boolean while the column stores the
 * `StackableState` text enum, so round-tripping the row value is unreliable.
 */
const ITEM_ADD_SPEC: PatchSpec = {
  description: { type: "string", },
  category: { type: "string", allowedValues: Object.values(ItemCategory,), },
  rarity: { type: "string", allowedValues: Object.values(ItemRarity,), },
  value: { type: "number", },
  weight: { type: "number", },
  maxStack: { type: "number", },
  stackable: { type: "boolean", },
  properties: { type: "json-object", requireEffectsArray: true, },
};

const APPLY_KINDS = ["world", "location", "item",] as const;
const ENTITY_KINDS = ["location", "item",] as const;

/**
 * Parse `key=value` update pairs from raw argument text.
 *
 * Values may be quoted to include spaces; unquoted values end at whitespace.
 * Tokens that are not `key=value` pairs are ignored. A repeated key is
 * LAST-WINS: the final pair overwrites earlier ones in the returned patch
 * (only the last `connections` array survives, likewise for every other
 * field) — the same rule `parseLocationUpdates` applies for `/loc-update`.
 * @param input - raw argument text
 * @param spec - allowed fields per command/kind; anything else is rejected
 * @param label - entity kind name used in error messages
 * @returns ok with the typed patch, or an error describing the first bad pair
 */
export function parseEntityPatch(input: string, spec: PatchSpec, label: string,): ParseEntityPatchResult {
  const pairRe = /([a-zA-Z]+)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g;
  const patch: EntityPatch = {};
  let matched = false;

  for (const match of input.matchAll(pairRe,)) {
    matched = true;
    const key = match[1] ?? "";
    const value = match[3] ?? match[4] ?? match[5] ?? "";

    const field = spec[key];
    if (!field) {
      return {
        ok: false,
        error: `Unknown ${label} field "${key}" — allowed: ${Object.keys(spec,).join(", ",)}.`,
      };
    }

    if (field.type === "string") {
      if (field.rejectEmpty && value === "") {
        return { ok: false, error: `Field "${key}" expects an id, got "".`, };
      }

      if (field.allowedValues && !(field.allowedValues as readonly string[]).includes(value,)) {
        return {
          ok: false,
          error: `Field "${key}" expects one of: ${field.allowedValues.join(", ",)} — got "${value}".`,
        };
      }

      patch[key] = value;
      continue;
    }

    if (field.type === "number") {
      const num = Number(value,);
      if (!Number.isFinite(num,)) {
        return { ok: false, error: `Field "${key}" expects a number, got "${value}".`, };
      }

      patch[key] = num;
      continue;
    }

    if (field.type === "boolean") {
      if (value !== "true" && value !== "false") {
        return { ok: false, error: `Field "${key}" expects true or false, got "${value}".`, };
      }

      patch[key] = value === "true";
      continue;
    }

    const parsed = safeJsonParse<unknown>(value,);
    if (!parsed.ok) {
      return {
        ok: false,
        error: `Field "${key}" expects JSON (${
          field.type === "json-array" ? "an array" : "an object"
        }), got "${value}".`,
      };
    }

    if (field.type === "json-array") {
      if (!Array.isArray(parsed.value,) || !parsed.value.every((id,): id is string => typeof id === "string")) {
        return { ok: false, error: `Field "${key}" expects a JSON array of strings, e.g. ${key}='["id-1"]'.`, };
      }

      patch[key] = parsed.value;
      continue;
    }

    if (typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value,)) {
      return { ok: false, error: `Field "${key}" expects a JSON object, e.g. ${key}='{"bonus":2}'.`, };
    }

    // createDefinition's parseItemEffects(def.properties.effects) throws on a
    // non-array outside any try/catch — reject before the user confirms.
    if (field.requireEffectsArray) {
      const effects = (parsed.value as Record<string, unknown>).effects;
      if (effects !== undefined && !Array.isArray(effects,)) {
        return {
          ok: false,
          error:
            `Field "${key}" expects "effects" to be a JSON array when present, e.g. ${key}='{"effects":["burn"]}'.`,
        };
      }
    }

    patch[key] = parsed.value as Record<string, unknown>;
  }

  if (!matched) {
    return {
      ok: false,
      error: 'No patch parsed — use key=value pairs, e.g. name="Rustic Tavern".',
    };
  }

  return { ok: true, patch, };
}

/** Render a parsed patch as `field → value` preview lines. */
function formatPatch(patch: EntityPatch,): string {
  return Object.entries(patch,)
    .map(([field, value,],) => {
      const serialized = typeof value === "object" ? safeJsonStringify(value,) : { ok: true, value, };
      return `- **${field}** → ${serialized.ok ? serialized.value : ""}`;
    },)
    .join("\n",);
}

/** Route effects worth surfacing in an update preview. */
function locationEffects(patch: EntityPatch,): string[] {
  const effects: string[] = [];
  if (patch.parentLocationId !== undefined) {
    effects.push(`Reparents this location under **${patch.parentLocationId}** (depth and cycle checks apply).`,);
  }

  if (patch.connections !== undefined) {
    effects.push("Replaces the travel connections; every id must belong to the same world.",);
  }

  return effects;
}

const NO_DB = (what: string,): CommandResult => ({
  systemMessage: `**${what} unavailable:** command context missing database.`,
  handled: true,
});

// ── /apply <kind> <id> <patch> ───────────────────────────────

registerCommand("apply", async (args, ctx,): Promise<CommandResult> => {
  const [kind, entityId,] = args;
  if (!kind || !entityId) {
    return {
      systemMessage: 'Usage: /apply <world|location|item> <id> name="New Name" description="…"',
      handled: true,
    };
  }

  if (!(APPLY_KINDS as readonly string[]).includes(kind,)) {
    return {
      systemMessage: `Unknown entity kind "${kind}" — /apply supports: ${APPLY_KINDS.join(", ",)}.`,
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return NO_DB(kind === "world" ? "Worlds" : kind === "location" ? "Locations" : "Items",);
  }

  const spec = kind === "world" ? WORLD_APPLY_SPEC : kind === "location" ? LOCATION_APPLY_SPEC : ITEM_APPLY_SPEC;
  const parsed = parseEntityPatch(args.slice(2,).join(" ",), spec, kind,);
  if (!parsed.ok) {
    return { systemMessage: `**Update patch rejected:** ${parsed.error}`, handled: true, };
  }

  // The patch is parsed before any row is touched, but the guard runs before
  // the preview. For world the id IS the scope; for location/item `world_id`
  // lives on the row, so the row is read first — the same read-first ordering
  // `/loc-get` uses. "Missing" and "not owned" produce byte-identical
  // messages so the id cannot be used as an existence oracle.
  let name: string;
  let worldId: string;
  let denied: string;
  if (kind === "world") {
    denied = `World ${entityId} not found or not owned by you.`;
    const row = await db
      .selectFrom("worlds",)
      .select(["name", "id",],)
      .where("id", "=", entityId,)
      .executeTakeFirst();

    if (!row) { return { systemMessage: denied, handled: true, }; }

    const err = await requireWorldOwner(db, entityId, ctx.userId ?? null, ctx.userRole ?? null,);
    if (err) { return { systemMessage: denied, handled: true, }; }

    name = row.name;
    worldId = row.id;
  } else if (kind === "location") {
    denied = `Location ${entityId} not found or not owned by you.`;
    const row = await db
      .selectFrom("locations",)
      .select(["id", "name", "world_id",],)
      .where("id", "=", entityId,)
      .executeTakeFirst();

    if (!row) { return { systemMessage: denied, handled: true, }; }

    const err = await requireWorldOwner(db, row.world_id, ctx.userId ?? null, ctx.userRole ?? null,);
    if (err) { return { systemMessage: denied, handled: true, }; }

    name = row.name;
    worldId = row.world_id;
  } else {
    denied = `Item ${entityId} not found or not owned by you.`;
    const row = await db
      .selectFrom("items",)
      .select(["id", "name", "world_id",],)
      .where("id", "=", entityId,)
      .executeTakeFirst();

    if (!row) { return { systemMessage: denied, handled: true, }; }

    // The item-definition PUT route's own guard (`handleDefinition` in
    // src/routes/story-items/handlers.ts) is `checkWorldOwnership`.
    const owned = await checkWorldOwnership(db, row.world_id, ctx.userId ?? null, ctx.userRole ?? null,);
    if (!owned) { return { systemMessage: denied, handled: true, }; }

    name = row.name;
    worldId = row.world_id;
  }

  const changes = formatPatch(parsed.patch,);
  const effects = kind === "location" ? locationEffects(parsed.patch,) : [];
  // World and location PUT routes set updated_at unconditionally
  // (handleUpdateWorld/handleUpdateLocation); the item PUT route does too.
  // Surface it for every kind so the preview names every row the confirm touches.
  effects.push(kind === "world" ? "Touches `updated_at` on the world row." : "Touches `updated_at` on the row.",);

  return {
    systemMessage: [
      `**Update preview** — **${name}** [${entityId}] will change:\n\n${changes}`,
      effects.length > 0 ? `**Effects:**\n${effects.map((e,) => `- ${e}`).join("\n",)}` : "",
      "Confirm in the dialog to apply.",
    ].filter(Boolean,).join("\n\n",),
    action: "apply-entity",
    actionPayload: { kind, entityId, worldId, updates: parsed.patch, name, },
    handled: true,
  };
}, { requiredRole: "member", },);

// ── /add <kind> <name> [world] [extras] ──────────────────────

registerCommand("add", async (args, ctx,): Promise<CommandResult> => {
  const [kind, name,] = args;
  if (!kind || !name) {
    return {
      systemMessage: 'Usage: /add <location|item> <name> [world-id] description="…" …',
      handled: true,
    };
  }

  if (!(ENTITY_KINDS as readonly string[]).includes(kind,)) {
    return {
      systemMessage: `Unknown entity kind "${kind}" — /add supports: ${ENTITY_KINDS.join(", ",)}.`,
      handled: true,
    };
  }

  // `args[2]` is the optional world id only when it is not a `key=value`
  // extra: `/add item Sword w-1 value=25` and `/add item Sword value=25`
  // (chat's world) must both resolve. World ids never contain "=".
  const worldArg = args[2] !== undefined && !args[2].includes("=",) ? args[2] : undefined;
  const worldId = worldArg ?? ctx.activeChat?.worldId;
  if (!worldId) {
    return {
      systemMessage: `Usage: /add ${kind} ${name} <world-id> — pass a world-id when the chat has no world.`,
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return NO_DB(kind === "location" ? "Locations" : "Items",);
  }

  // Same guards the create routes apply: `handleCreateLocation` uses
  // `requireWorldOwner`, the item-definitions POST route uses
  // `checkWorldOwnership`.
  const DENIED = `World ${worldId} not found or not owned by you.`;
  if (kind === "location") {
    const err = await requireWorldOwner(db, worldId, ctx.userId ?? null, ctx.userRole ?? null,);
    if (err) { return { systemMessage: DENIED, handled: true, }; }
  } else {
    const owned = await checkWorldOwnership(db, worldId, ctx.userId ?? null, ctx.userRole ?? null,);
    if (!owned) { return { systemMessage: DENIED, handled: true, }; }
  }

  const spec = kind === "location" ? LOCATION_ADD_SPEC : ITEM_ADD_SPEC;
  const extraStart = worldArg !== undefined ? 3 : 2;
  const rawExtras = args.slice(extraStart,).join(" ",);
  // Extras are OPTIONAL: `/add item Sword w-1` is a valid bare-name add, the
  // route fills every other column with its own defaults.
  const parsed = rawExtras.trim() === ""
    ? { ok: true as const, patch: {} as EntityPatch, }
    : parseEntityPatch(rawExtras, spec, kind,);

  if (!parsed.ok) {
    return { systemMessage: `**Add rejected:** ${parsed.error}`, handled: true, };
  }

  // Preview-time duplicate check mirroring the route's dedupe tuple: the POST
  // route funnels into `createDefinition`, which rejects an existing
  // (worldId, name, category) with a 409 AFTER the user confirmed. Category
  // omitted in the extras means the route's `enumOr` fallback "other". The
  // same name under a DIFFERENT category is allowed by the tuple and stays
  // allowed here.
  if (kind === "item") {
    // allowedValues on `category` guarantees membership in ItemCategory.
    const effectiveCategory = typeof parsed.patch.category === "string"
      ? (parsed.patch.category as ItemCategory)
      : ItemCategory.Other;

    const dup = await db
      .selectFrom("items",)
      .select("id",)
      .where("world_id", "=", worldId,)
      .where("name", "=", name,)
      .where("category", "=", effectiveCategory,)
      .executeTakeFirst();

    if (dup) {
      return {
        systemMessage:
          `**Add rejected:** an item named "${name}" already exists in world ${worldId} with category "${effectiveCategory}" — /clone it instead, or pick another name/category.`,
        handled: true,
      };
    }
  }

  const extras = Object.keys(parsed.patch,).length > 0 ? `\n\n${formatPatch(parsed.patch,)}` : "";
  return {
    systemMessage: [
      `**Add preview** — new **${kind}** **${name}** in world ${worldId}.${extras}`,
      "Confirm in the dialog to create it.",
    ].join("\n\n",),
    action: "add-entity",
    actionPayload: { kind, worldId, name, fields: parsed.patch, },
    handled: true,
  };
}, { requiredRole: "member", },);

// ── /clone <kind> <source-id> [overrides] ────────────────────

registerCommand("clone", async (args, ctx,): Promise<CommandResult> => {
  const [kind, sourceId,] = args;
  if (!kind || !sourceId) {
    return {
      systemMessage: 'Usage: /clone <location|item> <source-id> [name="Custom Copy"] [overrides …]',
      handled: true,
    };
  }

  if (!(ENTITY_KINDS as readonly string[]).includes(kind,)) {
    return {
      systemMessage: `Unknown entity kind "${kind}" — /clone supports: ${ENTITY_KINDS.join(", ",)}.`,
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return NO_DB(kind === "location" ? "Locations" : "Items",);
  }

  // A clone is created in the SOURCE's world, so ownership of the source row
  // IS ownership of the target world — one guard covers both sides. Same
  // guards as the create routes (`requireWorldOwner` for locations,
  // `checkWorldOwnership` for items).
  let name: string;
  let worldId: string;
  let copied: EntityPatch;
  if (kind === "location") {
    const DENIED = `Location ${sourceId} not found or not owned by you.`;
    const row = await db
      .selectFrom("locations",)
      .select([
        "id",
        "name",
        "world_id",
        "description",
        "kind",
        "mobility_mode",
        "coord_x",
        "coord_y",
        "coord_z",
        "connections",
      ],)
      .where("id", "=", sourceId,)
      .executeTakeFirst();

    if (!row) { return { systemMessage: DENIED, handled: true, }; }

    const err = await requireWorldOwner(db, row.world_id, ctx.userId ?? null, ctx.userRole ?? null,);
    if (err) { return { systemMessage: DENIED, handled: true, }; }

    // parent_location_id is deliberately NOT copied: the clone must not
    // silently appear as a sibling in the source's tree position.
    const conn = safeJsonParse<unknown>(row.connections ?? "[]",);
    copied = {
      name: `${row.name} (copy)`,
      ...(row.description != null ? { description: row.description, } : {}),
      kind: row.kind,
      mobilityMode: row.mobility_mode,
      ...(row.coord_x !== null ? { coordX: row.coord_x, } : {}),
      ...(row.coord_y !== null ? { coordY: row.coord_y, } : {}),
      ...(row.coord_z !== null ? { coordZ: row.coord_z, } : {}),
      ...(conn.ok && Array.isArray(conn.value,)
        ? { connections: conn.value.filter((id,): id is string => typeof id === "string"), }
        : {}),
    };

    name = row.name;
    worldId = row.world_id;
  } else {
    const DENIED = `Item ${sourceId} not found or not owned by you.`;
    const row = await db
      .selectFrom("items",)
      .select(["id", "name", "world_id", "description", "category", "rarity", "value", "weight", "properties",],)
      .where("id", "=", sourceId,)
      .executeTakeFirst();

    if (!row) { return { systemMessage: DENIED, handled: true, }; }

    const owned = await checkWorldOwnership(db, row.world_id, ctx.userId ?? null, ctx.userRole ?? null,);
    if (!owned) { return { systemMessage: DENIED, handled: true, }; }

    const props = safeJsonParse<Record<string, unknown>>(row.properties ?? "{}",);
    copied = {
      name: `${row.name} (copy)`,
      ...(row.description != null ? { description: row.description, } : {}),
      category: row.category,
      rarity: row.rarity,
      value: row.value,
      weight: row.weight,
      properties: props.ok && props.value && typeof props.value === "object" && !Array.isArray(props.value,)
        ? props.value
        : {},
    };

    name = row.name;
    worldId = row.world_id;
  }

  // Optional overrides: `name="…"` renames the copy; any other add-spec field
  // replaces the copied value. Last-wins via parseEntityPatch. Overrides are
  // OPTIONAL — an empty override list clones the source as-is, so an input
  // with no `key=value` pairs short-circuits instead of erroring.
  const spec = kind === "location"
    ? { ...LOCATION_ADD_SPEC, name: { type: "string" as const, }, }
    : { ...ITEM_ADD_SPEC, name: { type: "string" as const, }, };

  const rawOverrides = args.slice(2,).join(" ",);
  const parsed = rawOverrides.trim() === ""
    ? { ok: true as const, patch: {} as EntityPatch, }
    : parseEntityPatch(rawOverrides, spec, kind,);

  if (!parsed.ok) {
    return { systemMessage: `**Clone rejected:** ${parsed.error}`, handled: true, };
  }

  const fields = { ...copied, ...parsed.patch, };
  const newName = (typeof fields.name === "string" ? fields.name : undefined) ?? `${name} (copy)`;
  fields.name = newName;

  const cloneNote = kind === "location"
    ? "Created without the source's `parentLocationId`."
    : "Created with route defaults for `stackable` / `maxStack`.";

  return {
    systemMessage: [
      `**Clone preview** — copy **${name}** [${sourceId}] as **${newName}**:\n\n${formatPatch(fields,)}`,
      cloneNote,
      "Confirm in the dialog to create the copy.",
    ].join("\n\n",),
    action: "clone-entity",
    actionPayload: { kind, sourceId, name: newName, worldId, fields, },
    handled: true,
  };
}, { requiredRole: "member", },);
