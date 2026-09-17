// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * v1 actorsSurface barrel (split out: one Elysia chain per file keeps TS2589 away).
 */
import { Elysia, } from "elysia";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { actorE2EPubkeyRoutes, } from "../actor-e2e-pubkeys";
import { actorItemsRoutes, } from "../actor-items";
import { actorLoreEntriesRoutes, } from "../actor-lore-entries";
import { actorMemoriesRoutes, } from "../actor-memories";
import { actorNotesRoutes, } from "../actor-notes";
import { battleRoutes, } from "../battle";
import { characterAvailabilityRoutes, } from "../character-availability";
import { characterAvatarsRoutes, } from "../character-avatars";
import { characterEmotionAvatarsRoutes, } from "../character-emotion-avatars";
import { characterEmotionsRoutes, } from "../character-emotions";
import { characterGrowthRoutes, } from "../character-growth";
import { characterInternalTraitsRoutes, } from "../character-internal-traits";
import { characterIoRoutes, } from "../character-io";
import { characterLicensingRoutes, } from "../character-licensing";
import { characterMoodRoutes, } from "../character-mood";
import { characterRelationshipsRoutes, } from "../character-relationships";
import { characterTraitsRoutes, } from "../character-traits";
import { characterWorldSetupRoutes, } from "../character-world-setup";
import { charactersRoutes, } from "../characters";
import { craftingRecipeRoutes, } from "../crafting";
import { craftingAttemptRoutes, } from "../crafting/attempt";
import { craftingOrderRoutes, } from "../crafting/orders";
import { craftingStationRoutes, } from "../crafting/stations";
import { gmNotesRoutes, } from "../gm-notes";
import { npcMovementRoutes, } from "../npc-movement";
import { questsRoutes, } from "../quests";
import { rpgRoutes, } from "../rpg";
import { storyItemsRoutes, } from "../story-items";
import { storyStatesRoutes, } from "../story-states";
import { storyTurnsRoutes, } from "../story-turns";
import { tradeRoutes, } from "../trade";
import { worldLoreEntriesRoutes, } from "../world-lore-entries";
import { worldsRoutes, } from "../worlds";

export function actorsSurface(opts: RegisterPluginsOpts,) {
  const { database, config, } = opts;
  const handleOpts = { database, config, };
  const prefix = "/api/v1";
  return new Elysia({ name: "v1-actors", },)
    // ── Actors / characters ──────────────────────────────────
    .use(charactersRoutes(handleOpts, prefix,),)
    .use(actorE2EPubkeyRoutes(handleOpts, prefix,),)
    .use(actorItemsRoutes(handleOpts, prefix,),)
    .use(actorMemoriesRoutes(handleOpts, prefix,),)
    .use(actorLoreEntriesRoutes(handleOpts, prefix,),)
    .use(actorNotesRoutes(handleOpts, prefix,),)
    .use(characterTraitsRoutes(handleOpts, prefix,),)
    .use(characterWorldSetupRoutes(handleOpts, prefix,),)
    .use(characterInternalTraitsRoutes(handleOpts, prefix,),)
    .use(characterGrowthRoutes(handleOpts, prefix,),)
    .use(characterMoodRoutes(handleOpts, prefix,),)
    .use(characterRelationshipsRoutes(handleOpts, prefix,),)
    .use(characterAvatarsRoutes(handleOpts, prefix,),)
    .use(characterEmotionsRoutes(handleOpts, prefix,),)
    .use(characterEmotionAvatarsRoutes(handleOpts, prefix,),)
    .use(characterAvailabilityRoutes(handleOpts, prefix,),)
    .use(characterLicensingRoutes(handleOpts, prefix,),)
    .use(characterIoRoutes(handleOpts, prefix,),)
    // ── Worlds & RPG ─────────────────────────────────────────
    .use(worldsRoutes(handleOpts, prefix,),)
    .use(worldLoreEntriesRoutes(handleOpts, prefix,),)
    .use(questsRoutes({ database, }, prefix,),)
    .use(storyTurnsRoutes(handleOpts, prefix,),)
    .use(storyStatesRoutes({ database, }, prefix,),)
    .use(storyItemsRoutes({ database, }, prefix,),)
    .use(craftingRecipeRoutes(handleOpts, prefix,),)
    .use(craftingStationRoutes(handleOpts, prefix,),)
    .use(craftingAttemptRoutes(handleOpts, prefix,),)
    .use(craftingOrderRoutes(handleOpts, prefix,),)
    .use(npcMovementRoutes(handleOpts, prefix,),)
    .use(rpgRoutes(handleOpts, prefix,),)
    .use(battleRoutes(handleOpts, prefix,),)
    .use(tradeRoutes(handleOpts, prefix,),)
    .use(gmNotesRoutes(handleOpts, prefix,),);
}
