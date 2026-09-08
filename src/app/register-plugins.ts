// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin registration for the Elysia app.
 *
 * Registers all route modules via `.use()` in a fixed order (route resolution
 * depends on registration order). Extracted from elysia-app.ts so the app
 * builder stays small; behavior is identical.
 */
import type { Elysia, } from "elysia";
import { ageGateRoutes, } from "../age-gate/controller";
import { assetRoutes, } from "../assets/controller";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { generationRoutes, } from "../generation/controller";
import { loraRoutes, } from "../generation/lora/routes";
import { imageEditRoutes, } from "../image-edit/routes";
import { personaRoutes, } from "../personas/controller";
import { activityRoutes, } from "../routes/activity";
import { activityStreamRoutes, } from "../routes/activity-stream";
import { actorE2EPubkeyRoutes, } from "../routes/actor-e2e-pubkeys";
import { actorItemsRoutes, } from "../routes/actor-items";
import { actorLoreEntriesRoutes, } from "../routes/actor-lore-entries";
import { actorMemoriesRoutes, } from "../routes/actor-memories";
import { actorNotesRoutes, } from "../routes/actor-notes";
import { adminRoutes, } from "../routes/admin";
import { adminCharacterOverridesRoutes, } from "../routes/admin-character-overrides";
import { adminNsfwRoutes, } from "../routes/admin-nsfw";
import { adminTemplateRoutes, } from "../routes/admin-templates";
import { analyticsRoutes, } from "../routes/analytics";
import { apiKeysRoutes, } from "../routes/api-keys";
import { assetSearchRoutes, } from "../routes/asset-search";
import { authProtectedRoutes, authPublicRoutes, } from "../routes/auth";
import { battleRoutes, } from "../routes/battle";
import { blogRoutes, } from "../routes/blog";
import { characterAvailabilityRoutes, } from "../routes/character-availability";
import { characterAvatarsRoutes, } from "../routes/character-avatars";
import { characterEmotionAvatarsRoutes, } from "../routes/character-emotion-avatars";
import { characterEmotionsRoutes, } from "../routes/character-emotions";
import { characterGrowthRoutes, } from "../routes/character-growth";
import { characterInternalTraitsRoutes, } from "../routes/character-internal-traits";
import { characterIoRoutes, } from "../routes/character-io";
import { characterLicensingRoutes, } from "../routes/character-licensing";
import { characterMoodRoutes, } from "../routes/character-mood";
import { characterRelationshipsRoutes, } from "../routes/character-relationships";
import { characterTraitsRoutes, } from "../routes/character-traits";
import { characterWorldSetupRoutes, } from "../routes/character-world-setup";
import { charactersRoutes, } from "../routes/characters";
import { chatBackgroundsRoutes, } from "../routes/chat-backgrounds";
import { chatContextRoutes, } from "../routes/chat-context";
import { chatExportRoutes, } from "../routes/chat-export";
import { chatPinRoutes, } from "../routes/chat-pins";
import { chatSearchRoutes, } from "../routes/chat-search";
import { chatSectionsRoutes, } from "../routes/chat-sections";
import { chatsRoutes, } from "../routes/chats";
import { commandsRoutes, } from "../routes/commands";
import { craftingRecipeRoutes, } from "../routes/crafting";
import { craftingAttemptRoutes, } from "../routes/crafting/attempt";
import { craftingOrderRoutes, } from "../routes/crafting/orders";
import { craftingStationRoutes, } from "../routes/crafting/stations";
import { exportRoutes, } from "../routes/export";
import { exportSseRoutes, } from "../routes/export-sse";
import { federationRoutes, } from "../routes/federation";
import { frontendLogsRoutes, } from "../routes/frontend-logs";
import { gmNotesRoutes, } from "../routes/gm-notes";
import { healthRoutes, } from "../routes/health";
import { livenessRoutes, } from "../routes/liveness";
import { metricsRoutes, } from "../routes/metrics";
import { i18nRoutes, } from "../routes/i18n";
import { importRoutes, } from "../routes/import";
import { invitesRoutes, } from "../routes/invites";
import { keyManagementRoutes, } from "../routes/key-management";
import { locationExplorerRoutes, } from "../routes/location-explorer";
import { messageEncryptionRoutes, } from "../routes/message-encryption";
import { messageReactionsRoutes, } from "../routes/message-reactions";
import { messageSearchRoutes, } from "../routes/message-search";
import { messageSeenRoutes, } from "../routes/message-seen";
import { messagesRoutes, } from "../routes/messages";
import { modelComparisonsRoutes, } from "../routes/model-comparisons";
import { musicLinksRoutes, } from "../routes/music-links";
import { notificationsRoutes, } from "../routes/notifications";
import { npcMovementRoutes, } from "../routes/npc-movement";
import { nsfwRoutes, } from "../routes/nsfw";
import { nsfwModerationRoutes, } from "../routes/nsfw-moderation";
import { pluginRoutes, } from "../routes/plugins";
import { proactiveMessagingRoutes, } from "../routes/proactive-messaging";
import { questsRoutes, } from "../routes/quests";
import { rpgRoutes, } from "../routes/rpg";
import { sessionsRoutes, } from "../routes/sessions";
import { settingsRoutes, } from "../routes/settings";
import { storyItemsRoutes, } from "../routes/story-items";
import { storyStatesRoutes, } from "../routes/story-states";
import { storyTurnsRoutes, } from "../routes/story-turns";
import { telemetryRoutes, } from "../routes/telemetry";
import { tradeRoutes, } from "../routes/trade";
import { usersRoutes, } from "../routes/users";
import { viewRoutes, } from "../routes/views";
import { vnGenerateRoutes, } from "../routes/vn-generate";
import { worldImportRoutes, } from "../routes/world-import";
import { worldInvitesRoutes, } from "../routes/world-invites";
import { worldLoreEntriesRoutes, } from "../routes/world-lore-entries";
import { worldsRoutes, } from "../routes/worlds";

/** */
export interface RegisterPluginsOpts {
  database: Db;
  config: Config;
  /** Async request-result store (request_results table writer). */
  asyncStore: import("../async/store").AsyncStore;
}

/**
 * Register every route module onto the app in the canonical order.
 * Order matters: Elysia resolves routes by path shape, and later registrations
 * can shadow earlier ones — keep this sequence stable. Mutates `app` in place.
 * @param app
 * @param opts
 */
export function registerPlugins(app: Elysia<any>, opts: RegisterPluginsOpts,): void {
  const { database, config, asyncStore, } = opts;
  const handleOpts = { database, config, asyncStore, };
  // ── Public routes (auth runs but won't block) ───────────────────────────────
  app.use(authPublicRoutes(handleOpts,),);
  app.use(healthRoutes(handleOpts,),);
  app.use(livenessRoutes({ database: handleOpts.database, config, },),);
  app.use(metricsRoutes({ config, },),);
  app.use(federationRoutes({ config, },),);
  app.use(i18nRoutes(handleOpts,),);
  app.use(telemetryRoutes(handleOpts,),);
  app.use(frontendLogsRoutes(),);

  // ── Auth protected routes ───────────────────────────────────────────────────
  app.use(authProtectedRoutes({ database: handleOpts.database, },),);

  // ── Migrated route modules ───────────────────────────────────────────────────
  app.use(activityRoutes(handleOpts,),);
  app.use(activityStreamRoutes(handleOpts,),);
  app.use(notificationsRoutes(handleOpts,),);
  app.use(proactiveMessagingRoutes(handleOpts,),);
  app.use(apiKeysRoutes(handleOpts,),);
  app.use(settingsRoutes(handleOpts,),);
  app.use(messageEncryptionRoutes(handleOpts,),);
  app.use(keyManagementRoutes({ database: handleOpts.database, },),);
  app.use(usersRoutes(handleOpts,),);
  app.use(sessionsRoutes(handleOpts,),);
  app.use(actorE2EPubkeyRoutes(handleOpts,),);
  app.use(actorItemsRoutes(handleOpts,),);
  app.use(actorMemoriesRoutes(handleOpts,),);
  app.use(actorLoreEntriesRoutes(handleOpts,),);
  app.use(actorNotesRoutes(handleOpts,),);
  app.use(worldLoreEntriesRoutes(handleOpts,),);
  app.use(worldsRoutes(handleOpts,),);
  app.use(craftingRecipeRoutes(handleOpts,),);
  app.use(craftingStationRoutes(handleOpts,),);
  app.use(craftingAttemptRoutes(handleOpts,),);
  app.use(craftingOrderRoutes(handleOpts,),);
  app.use(chatSectionsRoutes(handleOpts,),);
  app.use(npcMovementRoutes(handleOpts,),);
  app.use(chatBackgroundsRoutes(handleOpts,),);
  app.use(locationExplorerRoutes(handleOpts,),);
  app.use(adminRoutes(handleOpts,),);
  app.use(pluginRoutes(handleOpts,),);
  app.use(storyTurnsRoutes(handleOpts,),);
  app.use(storyStatesRoutes(handleOpts,),);
  app.use(storyItemsRoutes(handleOpts,),);
  app.use(questsRoutes(handleOpts,),);
  app.use(charactersRoutes(handleOpts,),);
  app.use(characterTraitsRoutes(handleOpts,),);
  app.use(characterWorldSetupRoutes(handleOpts,),);
  app.use(characterInternalTraitsRoutes(handleOpts,),);
  app.use(characterGrowthRoutes(handleOpts,),);
  app.use(characterMoodRoutes(handleOpts,),);
  app.use(characterRelationshipsRoutes(handleOpts,),);
  app.use(characterAvatarsRoutes(handleOpts,),);
  app.use(characterEmotionsRoutes(handleOpts,),);
  app.use(characterEmotionAvatarsRoutes(handleOpts,),);
  app.use(characterAvailabilityRoutes(handleOpts,),);
  app.use(characterLicensingRoutes(handleOpts,),);
  app.use(adminCharacterOverridesRoutes(handleOpts,),);
  app.use(adminTemplateRoutes(handleOpts,),);
  app.use(adminNsfwRoutes(handleOpts,),);
  app.use(characterIoRoutes(handleOpts,),);
  app.use(messagesRoutes(handleOpts,),);
  app.use(musicLinksRoutes(handleOpts,),);
  app.use(messageReactionsRoutes(handleOpts,),);
  app.use(messageSearchRoutes(handleOpts,),);
  app.use(chatsRoutes(handleOpts,),);
  app.use(chatSearchRoutes(handleOpts,),);
  app.use(invitesRoutes(handleOpts,),);
  app.use(worldInvitesRoutes(handleOpts,),);
  app.use(gmNotesRoutes(handleOpts,),);
  app.use(vnGenerateRoutes({ database: handleOpts.database, config, },),);
  app.use(chatPinRoutes(handleOpts,),);
  app.use(commandsRoutes({},),);
  app.use(chatExportRoutes(handleOpts,),);
  app.use(chatContextRoutes(handleOpts,),);
  app.use(importRoutes(handleOpts,),);
  app.use(personaRoutes(handleOpts,),);
  app.use(generationRoutes(handleOpts,),);
  app.use(loraRoutes({ config, },),);
  app.use(ageGateRoutes(handleOpts,),);
  app.use(nsfwRoutes(handleOpts,),);
  app.use(nsfwModerationRoutes(handleOpts,),);
  app.use(assetRoutes(handleOpts,),);
  app.use(assetSearchRoutes(handleOpts,),);
  app.use(imageEditRoutes({ database: handleOpts.database, },),);
  app.use(rpgRoutes(handleOpts,),);
  app.use(tradeRoutes(handleOpts,),);
  app.use(viewRoutes({ database: handleOpts.database, },),);

  // ── Analytics ────────────────────────────────────────────────────────────
  app.use(analyticsRoutes({ database: handleOpts.database, },),);
  app.use(modelComparisonsRoutes({ database: handleOpts.database, },),);

  // ── Battle integration ───────────────────────────────────────────────────
  app.use(battleRoutes(handleOpts,),);

  // ── Blog system ──────────────────────────────────────────────────────────
  app.use(blogRoutes({ database: handleOpts.database, },),);

  // ── Bulk import/export (ZIP) ─────────────────────────────────────────────
  app.use(exportRoutes({ database: handleOpts.database, },),);
  app.use(exportSseRoutes({ database: handleOpts.database, },),);
  app.use(worldImportRoutes(handleOpts,),);
  app.use(messageSeenRoutes({ database: handleOpts.database, },),);
}
