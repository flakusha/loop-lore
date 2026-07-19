import type { Kysely, } from "kysely";

import { down as downUsers, up as upUsers, } from "./parts/001_users";
import { down as downAssets, up as upAssets, } from "./parts/002_assets";
import { down as downWorlds, up as upWorlds, } from "./parts/003_worlds";
import { down as downChatsActors, up as upChatsActors, } from "./parts/004_chats_actors";
import { down as downActorData, up as upActorData, } from "./parts/005_actor_data";
import { down as downMessagesKeys, up as upMessagesKeys, } from "./parts/006_messages_keys";
import { down as downStoryGeneration, up as upStoryGeneration, } from "./parts/007_story_generation";
import { down as downModelRoles, up as upModelRoles, } from "./parts/008_model_roles";

/**
 * Initial schema migration — orchestrates the split part modules in
 * dependency-correct order. Each part lives in `./parts/*` so the
 * single migration named `001_init` still applies atomically (and the
 * dir-scanning migrator, which only reads the migrations root, treats
 * this file as the one migration to run).
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await upUsers(database,);
  await upAssets(database,);
  await upWorlds(database,);
  await upChatsActors(database,);
  await upActorData(database,);
  await upMessagesKeys(database,);
  await upStoryGeneration(database,);
  await upModelRoles(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await downModelRoles(database,);
  await downStoryGeneration(database,);
  await downMessagesKeys(database,);
  await downActorData(database,);
  await downChatsActors(database,);
  await downWorlds(database,);
  await downAssets(database,);
  await downUsers(database,);
}
