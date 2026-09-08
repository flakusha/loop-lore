// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Initial schema migration — final-form DDL (single atomic migration).
 * Orcograms the extensive parts/ tree in dependency order; every part
 * holds pure CREATE (no DROP, no PRAGMA foreign_keys toggle).
 */
import type { Kysely, } from "kysely";
import { down as downCore, up as upCore, } from "./parts/001_core";
import { down as downAssets, up as upAssets, } from "./parts/002_assets";
import { down as downWorlds, up as upWorlds, } from "./parts/003_worlds";
import { down as downActors, up as upActors, } from "./parts/004_actors";
import { down as downCharacters, up as upCharacters, } from "./parts/005_characters";
import { down as downChat, up as upChat, } from "./parts/006_chat";
import { down as downPersonas, up as upPersonas, } from "./parts/007_personas";
import { down as downStory, up as upStory, } from "./parts/008_story";
import { down as downCrafting, up as upCrafting, } from "./parts/009_crafting";
import { down as downProgression, up as upProgression, } from "./parts/010_progression";
import { down as downBlog, up as upBlog, } from "./parts/011_blog";
import { down as downMemory, up as upMemory, } from "./parts/012_memory";
import { down as downGeneration, up as upGeneration, } from "./parts/013_generation";
import { down as downModeration, up as upModeration, } from "./parts/014_moderation";
import { down as downE2E, up as upE2E, } from "./parts/015_e2e";
import { down as downFts, up as upFts, } from "./parts/016_fts";
import { down as downDropTemplateVn, up as upDropTemplateVn, } from "./parts/017_drop_template_visual_novel";
import { down as downSchemaVersion, up as upSchemaVersion, } from "./parts/018_schema_version";
import {
  down as downTradeRequestedMaterials,
  up as upTradeRequestedMaterials,
} from "./parts/019_trade_requested_materials";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await upCore(database,);
  await upAssets(database,);
  await upWorlds(database,);
  await upActors(database,);
  await upCharacters(database,);
  await upChat(database,);
  await upPersonas(database,);
  await upStory(database,);
  await upCrafting(database,);
  await upProgression(database,);
  await upBlog(database,);
  await upMemory(database,);
  await upGeneration(database,);
  await upModeration(database,);
  await upE2E(database,);
  await upFts(database,);
  await upDropTemplateVn(database,);
  await upSchemaVersion(database,);
  await upTradeRequestedMaterials(database,);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await downTradeRequestedMaterials(database,);
  await downSchemaVersion(database,);
  await downDropTemplateVn(database,);
  await downFts(database,);
  await downE2E(database,);
  await downModeration(database,);
  await downGeneration(database,);
  await downMemory(database,);
  await downBlog(database,);
  await downProgression(database,);
  await downCrafting(database,);
  await downStory(database,);
  await downPersonas(database,);
  await downChat(database,);
  await downCharacters(database,);
  await downActors(database,);
  await downWorlds(database,);
  await downAssets(database,);
  await downCore(database,);
}
