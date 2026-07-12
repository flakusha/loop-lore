import type { Kysely } from "kysely";

import { up as upUsers, down as downUsers } from "./parts/001_users";
import { up as upAssets, down as downAssets } from "./parts/002_assets";
import { up as upWorlds, down as downWorlds } from "./parts/003_worlds";
import { up as upChatsActors, down as downChatsActors } from "./parts/004_chats_actors";
import { up as upActorData, down as downActorData } from "./parts/005_actor_data";
import { up as upMessagesKeys, down as downMessagesKeys } from "./parts/006_messages_keys";
import { up as upStoryGeneration, down as downStoryGeneration } from "./parts/007_story_generation";
import { up as upModelRoles, down as downModelRoles } from "./parts/008_model_roles";

/**
 * Initial schema migration — orchestrates the split part modules in
 * dependency-correct order. Each part lives in `./parts/*` so the
 * single migration named `001_init` still applies atomically (and the
 * dir-scanning migrator, which only reads the migrations root, treats
 * this file as the one migration to run).
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await upUsers(database);
  await upAssets(database);
  await upWorlds(database);
  await upChatsActors(database);
  await upActorData(database);
  await upMessagesKeys(database);
  await upStoryGeneration(database);
  await upModelRoles(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await downModelRoles(database);
  await downStoryGeneration(database);
  await downMessagesKeys(database);
  await downActorData(database);
  await downChatsActors(database);
  await downWorlds(database);
  await downAssets(database);
  await downUsers(database);
}
