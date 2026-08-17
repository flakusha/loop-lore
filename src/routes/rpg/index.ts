// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { achievementsRoutes, } from "./achievements";
import { achievementsPlayerRoutes, } from "./achievements-player";
import { combatRoutes, } from "./combat";
import { combatStatusRoutes, } from "./combat-status";
import { diceRoutes, } from "./dice";
import { npcNavigationRoutes, } from "./npc-navigation";
import { replayabilityRoutes, } from "./replayability";
import { skillsRoutes, } from "./skills";
import { skillsProgressionRoutes, } from "./skills-progression";
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
 *   World & Location Traits:
 *     /api/rpg/world-location-traits/worlds|locations/... — trait CRUD
 *     /api/rpg/world-location-traits/actors/:actorId — aggregate
 */
export function rpgRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "rpg", },)
      .use(diceRoutes(opts,),)
      .use(statsRoutes(opts,),)
      .use(statsActorRoutes(opts,),)
      .use(achievementsRoutes(opts,),)
      .use(achievementsPlayerRoutes(opts,),)
      .use(replayabilityRoutes(opts,),)
      .use(skillsRoutes(opts,),)
      .use(skillsProgressionRoutes(opts,),)
      .use(npcNavigationRoutes(opts,),)
      .use(worldLocationTraitsRoutes(opts,),)
      .use(combatRoutes(opts,),)
      .use(combatStatusRoutes(opts,),)
      .use(xpLootRoutes(opts,),)
      .use(xpLootTablesRoutes(opts,),)
  );
}
