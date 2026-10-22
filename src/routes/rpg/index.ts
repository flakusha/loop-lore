// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { achievementsRoutes, } from "./achievements";
import { achievementsPlayerRoutes, } from "./achievements-player";
import { bestiaryRoutes, } from "./bestiary";
import { combatRoutes, } from "./combat";
import { combatStatusRoutes, } from "./combat-status";
import { craftingExecutionRoutes, } from "./crafting-execution";
import { craftingStationRoutes, } from "./crafting-stations";
import { diceRoutes, } from "./dice";
import { npcMemoryRoutes, } from "./npc-memory";
import { npcNavigationRoutes, } from "./npc-navigation";
import { progressionRoutes, } from "./progression";
import { questionsRoutes, } from "./questions";
import { replayabilityRoutes, } from "./replayability";
import { skillsRoutes, } from "./skills";
import { skillsProgressionRoutes, } from "./skills-progression";
import { statAllocationRoutes, } from "./stat-allocation";
import { statsRoutes, } from "./stats";
import { statsActorRoutes, } from "./stats-actor";
import type { HandlerOpts, } from "./types";
import { worldLocationTraitsRoutes, } from "./world-location-traits";
import { xpLootRoutes, } from "./xp-loot";
import { xpLootTablesRoutes, } from "./xp-loot-tables";

/**
 * RPG Routes facade — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`rpg`) is preserved so the
 * `register-plugins.ts` wiring is unchanged.
 *
 *   Dice:
 *     POST /api/rpg/dice/roll — roll dice with crypto entropy
 *     POST /api/rpg/dice/notation — roll from notation string (e.g. "2d6+3")
 *     POST /api/rpg/dice/advantage — roll d20 with advantage/disadvantage
 *
 *   Stats:
 *     POST /api/rpg/stats/calculate — compute modifiers from stat block
 *     POST /api/rpg/stats/validate — validate a stat block
 *     POST /api/rpg/stats/generate — generate stats (point-buy, 4d6-drop-lowest, standard)
 *
 *   Achievements:
 *     GET/POST /api/rpg/achievements — list/create definitions
 *     GET/PUT/DELETE /api/rpg/achievements/:id — definition CRUD
 *     .../player/... — player progress & rewards
 *
 *   Replayability:
 *     /api/rpg/replayability/playthroughs... — playthrough lifecycle
 *     /api/rpg/replayability/new-game-plus — NG+ start
 *     /api/rpg/replayability/players/:playerId/meta — meta-progression
 *
 *   Skills:
 *     GET/POST /api/rpg/skills — list/create
 *     GET/PUT/DELETE /api/rpg/skills/:id — skill CRUD
 *     .../actors/:actorId/... — actor-scoped skills, XP, specialization
 *
 *   NPC Navigation:
 *     /api/rpg/npc-navigation/actors/:actorId/... — state, pattern, move
 *     /api/rpg/npc-navigation/worlds/:worldId/tick — movement tick
 *
 *   NPC Memory:
 *     /api/rpg/npc-memory/worlds/:worldId/npcs/:npcId/memories — record/recall
 *     /api/rpg/npc-memory/worlds/:worldId/memories/:memoryId/reinforce
 *     /api/rpg/npc-memory/worlds/:worldId/relationships — standing/bond shift
 *     /api/rpg/npc-memory/worlds/:worldId/decay — decay sweep
 *
 *   Bestiary:
 *     /api/rpg/bestiary/worlds/:worldId/monsters — template list/register
 *     /api/rpg/bestiary/worlds/:worldId/locations/:locationId/monsters
 *     /api/rpg/bestiary/worlds/:worldId/spawns — place a spawn (+ seeded loot)
 *     /api/rpg/bestiary/worlds/:worldId/despawn-expired
 *
 *   Questions (TASK-029):
 *     POST/GET /api/chats/:id/questions — create/list open questions
 *     POST /api/questions/:id/answer — record a choice
 *
 *   Progression (XP-leveling epic):
 *     GET  /api/rpg/progression/:actorId — level/xp/pending ASI read surface
 *     POST /api/rpg/progression/:actorId/award — XP through the LevelService
 *     POST /api/rpg/progression/:actorId/asi — allocate pending points
 *     POST /api/rpg/progression/:actorId/level-up — resolve a decision
 *
 *   World & Location Traits:
 *     /api/rpg/world-location-traits/worlds|locations/... — trait CRUD
 *     /api/rpg/world-location-traits/actors/:actorId — aggregate
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { rpg: { dice: { roll: { ...; }; }; }; }; } & ... 7 more ... & { ...; }, { ...; }, { ...; } & { ...; }>}
 */
export function rpgRoutes(opts: HandlerOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "rpg", },)
      .use(diceRoutes(opts, prefix,),)
      .use(statsRoutes(opts, prefix,),)
      .use(statsActorRoutes(opts, prefix,),)
      .use(statAllocationRoutes(opts, prefix,),)
      .use(achievementsRoutes(opts, prefix,),)
      .use(achievementsPlayerRoutes(opts, prefix,),)
      .use(replayabilityRoutes(opts, prefix,),)
      .use(skillsRoutes(opts, prefix,),)
      .use(skillsProgressionRoutes(opts, prefix,),)
      .use(npcNavigationRoutes(opts, prefix,),)
      .use(npcMemoryRoutes(opts, prefix,),)
      .use(bestiaryRoutes(opts, prefix,),)
      .use(questionsRoutes(opts, prefix,),)
      .use(worldLocationTraitsRoutes(opts, prefix,),)
      .use(combatRoutes(opts, prefix,),)
      .use(combatStatusRoutes(opts, prefix,),)
      .use(craftingStationRoutes(opts, prefix,),)
      .use(craftingExecutionRoutes(opts, prefix,),)
      .use(xpLootRoutes(opts, prefix,),)
      .use(xpLootTablesRoutes(opts, prefix,),)
      .use(progressionRoutes(opts, prefix,),)
  );
}
