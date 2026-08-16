// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { equipmentRoutes, } from "./equipment";
import { moraleRoutes, } from "./morale";
import { npcRoutes, } from "./npc";
import { resolutionRoutes, } from "./resolution";
import { socialRoutes, } from "./social";
import type { HandlerOpts, } from "./types";
import { weatherRoutes, } from "./weather";

/**
 * Battle route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`battle`) is preserved so the
 * `elysia-app.ts` wiring is unchanged.
 *
 * Endpoints (all POST):
 *   Equipment: /api/battle/equipment/{calculate,can-equip,durability,repair,loot}
 *   Social:    /api/battle/social/{intimidate,taunt,surrender,rally,inspire,demoralize}
 *   NPC:       /api/battle/npc/{decision,memory,surrender}
 *   Weather:   /api/battle/weather/{modifiers,visibility,hazard}
 *   Resolution:/api/battle/resolution/{damage,attack,defense,round}
 *   Morale:    /api/battle/morale/{compute,apply,break}
 */
export function battleRoutes(opts: HandlerOpts,) {
  const { database: _database, } = opts;

  return new Elysia({ name: "battle", },)
    .use(equipmentRoutes(opts,),)
    .use(socialRoutes(opts,),)
    .use(npcRoutes(opts,),)
    .use(weatherRoutes(opts,),)
    .use(resolutionRoutes(opts,),)
    .use(moraleRoutes(opts,),);
}
