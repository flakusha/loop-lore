import { Elysia, } from "elysia";
import { diceRoutes, } from "./dice";
import { statsRoutes, } from "./stats";
import type { HandlerOpts, } from "./types";

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
 */
export function rpgRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "rpg", },)
      .use(diceRoutes(opts,),)
      .use(statsRoutes(opts,),)
  );
}
