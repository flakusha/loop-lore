/**
 * Character World Setup — validation schemas.
 *
 * TypeBox bodies for the per-world character setup bundle
 * (`character_world_setup`) REST surface.
 */
import { t, } from "elysia";

/** An item the character begins with in a world (starting inventory). */
export const WorldSetupInventoryItemSchema = t.Object({
  item_id: t.String({ minLength: 1, },),
  name: t.Optional(t.String(),),
  quantity: t.Number({ minimum: 0, },),
  equipped: t.Optional(t.Boolean(),),
  metadata: t.Optional(t.Record(t.String(), t.Any(),),),
},);

/** A world-scoped character lore entry (keys + content). */
export const WorldSetupLoreEntrySchema = t.Object({
  name: t.Optional(t.String(),),
  keys: t.Array(t.String(),),
  content: t.String(),
  enabled: t.Optional(t.Boolean(),),
  constant: t.Optional(t.Boolean(),),
  priority: t.Optional(t.Number(),),
},);

/** Upsert body for a character world setup bundle. */
export const WorldSetupUpsertBody = t.Object({
  startingInventory: t.Optional(t.Array(WorldSetupInventoryItemSchema,),),
  loreEntries: t.Optional(t.Array(WorldSetupLoreEntrySchema,),),
  backstory: t.Optional(t.Nullable(t.String(),),),
  scenarioOverride: t.Optional(t.Nullable(t.String(),),),
  systemPromptOverride: t.Optional(t.Nullable(t.String(),),),
  initialState: t.Optional(t.Record(t.String(), t.Any(),),),
},);

/** Raw setup row response. */
export const WorldSetupResponse = t.Object({
  id: t.String(),
  actor_id: t.String(),
  world_id: t.String(),
  starting_inventory: t.String(),
  lore_entries: t.String(),
  backstory: t.Nullable(t.String(),),
  scenario_override: t.Nullable(t.String(),),
  system_prompt_override: t.Nullable(t.String(),),
  initial_state: t.String(),
  created_at: t.String(),
  updated_at: t.String(),
},);

/** Resolved (base + world merged) setup response. */
export const WorldSetupResolvedResponse = t.Object({
  actorId: t.String(),
  worldId: t.String(),
  baseScenario: t.Nullable(t.String(),),
  baseSystemPrompt: t.Nullable(t.String(),),
  scenario: t.Nullable(t.String(),),
  systemPrompt: t.Nullable(t.String(),),
  backstory: t.Nullable(t.String(),),
  startingInventory: t.Array(WorldSetupInventoryItemSchema,),
  loreEntries: t.Array(WorldSetupLoreEntrySchema,),
  initialState: t.Record(t.String(), t.Any(),),
},);
