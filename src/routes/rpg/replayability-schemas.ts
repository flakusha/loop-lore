// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Replayability route schemas.
 *
 * TypeBox body/query schemas for the replayability routes
 * (`replayability.ts`). Extracted to keep the route module under the 250L
 * ceiling.
 */

import { t, } from "elysia";
import { EndingType, PlusDifficulty, } from "../../rpg/replayability";

export const playthroughBody = t.Object({
  playerId: t.String(),
  worldId: t.String(),
  difficulty: t.Optional(t.Enum(PlusDifficulty,),),
  metadata: t.Optional(t.Record(t.String(), t.Any(),),),
},);

export const completePlaythroughBody = t.Object({
  endingId: t.String(),
  endingType: t.Enum(EndingType,),
  completionTime: t.Number({ minimum: 0, },),
},);

export const recordSecretBody = t.Object({
  secretId: t.String(),
},);

export const newGamePlusBody = t.Object({
  playerId: t.String(),
  worldId: t.String(),
  previousPlaythroughId: t.String(),
  difficulty: t.Optional(t.Enum(PlusDifficulty,),),
  carryOverChoices: t.Optional(t.Boolean(),),
  carryOverItems: t.Optional(t.Boolean(),),
},);

export const playthroughsQuery = t.Object({
  worldId: t.Optional(t.String(),),
},);
