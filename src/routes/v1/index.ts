// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * V1 API routes barrel.
 *
 * Mounts all route plugins under `/api/v1/` using the `prefix` parameter.
 * Each route factory accepts an optional `prefix` parameter (default `/api`).
 * Here we pass `prefix = "/api/v1"` so routes register under `/api/v1/...`.
 *
 * Uses `.use()` (not `.mount()`) so Elysia's `.derive()` context (userId,
 * userRole, etc.) propagates correctly to all child routes.
 *
 * Deliberately NOT versioned (mounted only unversioned by
 * `register-plugins.ts`):
 * - `livenessRoutes` / `metricsRoutes` — infra probes (`/health/*`, `/metrics`)
 * - `federationRoutes` — NodeInfo + mesh peer protocol (spec-fixed paths)
 * - `viewRoutes` — server-rendered HTML under `/views/*`, not a JSON API
 * @see docs/spec/api-versioning.md
 */
import { Elysia, } from "elysia";
import { loraRoutes, } from "../../../src/generation/lora/routes";
import { ageGateRoutes, } from "../../age-gate/controller";
import { assetRoutes, } from "../../assets/controller";
import { generationRoutes, } from "../../generation/controller";
import { imageEditRoutes, } from "../../image-edit/routes";
import { localInferenceRoutes, } from "../../inference/routes";
import { personaRoutes, } from "../../personas/controller";
import { activityRoutes, } from "../activity";
import { activityStreamRoutes, } from "../activity-stream";
import { actorE2EPubkeyRoutes, } from "../actor-e2e-pubkeys";
import { actorItemsRoutes, } from "../actor-items";
import { actorLoreEntriesRoutes, } from "../actor-lore-entries";
import { actorMemoriesRoutes, } from "../actor-memories";
import { actorNotesRoutes, } from "../actor-notes";
import { adminRoutes, } from "../admin";
import { adminCharacterOverridesRoutes, } from "../admin-character-overrides";
import { adminNsfwRoutes, } from "../admin-nsfw";
import { adminTemplateRoutes, } from "../admin-templates";
import { sdTemplatesRoutes, } from "../admin/sd-templates";
import { analyticsRoutes, } from "../analytics";
import { apiKeysRoutes, } from "../api-keys";
import { assetSearchRoutes, } from "../asset-search";
import { assetTagRoutes, } from "../asset-tags";
import { authProtectedRoutes, authPublicRoutes, } from "../auth";
import { battleRoutes, } from "../battle";
import { blogRoutes, } from "../blog";
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
import { chatBackgroundsRoutes, } from "../chat-backgrounds";
import { chatContextRoutes, } from "../chat-context";
import { chatExportRoutes, } from "../chat-export";
import { chatPinRoutes, } from "../chat-pins";
import { chatSearchRoutes, } from "../chat-search";
import { chatSectionsRoutes, } from "../chat-sections";
import { chatsRoutes, } from "../chats";
import { commandsRoutes, } from "../commands";
import { craftingRecipeRoutes, } from "../crafting";
import { craftingAttemptRoutes, } from "../crafting/attempt";
import { craftingOrderRoutes, } from "../crafting/orders";
import { craftingStationRoutes, } from "../crafting/stations";
import { exportRoutes, } from "../export";
import { exportSseRoutes, } from "../export-sse";
import { frontendLogsRoutes, } from "../frontend-logs";
import { gifSearchRoutes, } from "../gifs/search";
import { gmNotesRoutes, } from "../gm-notes";
import { healthRoutes, } from "../health";
import { i18nRoutes, } from "../i18n";
import { importRoutes, } from "../import";
import { invitesRoutes, } from "../invites";
import { keyManagementRoutes, } from "../key-management";
import { messageEncryptionRoutes, } from "../message-encryption";
import { messageReactionsRoutes, } from "../message-reactions";
import { messageSearchRoutes, } from "../message-search";
import { messageSeenRoutes, } from "../message-seen";
import { messagesRoutes, } from "../messages";
import { deprecationAfterHandle, } from "../middleware/deprecation-headers";
import { versionResolver, } from "../middleware/version-resolver";
import { modelComparisonsRoutes, } from "../model-comparisons";
import { musicLinksRoutes, } from "../music-links";
import { notificationsRoutes, } from "../notifications";
import { npcMovementRoutes, } from "../npc-movement";
import { nsfwRoutes, } from "../nsfw";
import { nsfwModerationRoutes, } from "../nsfw-moderation";
import { pluginRoutes, } from "../plugins";
import { proactiveMessagingRoutes, } from "../proactive-messaging";
import { questsRoutes, } from "../quests";
import { requestStatusRoutes, } from "../requests";
import { rpgRoutes, } from "../rpg";
import { sessionsRoutes, } from "../sessions";
import { switchSessionRoutes, } from "../sessions-switch";
import { settingsRoutes, } from "../settings";
import { storyItemsRoutes, } from "../story-items";
import { storyStatesRoutes, } from "../story-states";
import { storyTurnsRoutes, } from "../story-turns";
import { telemetryRoutes, } from "../telemetry";
import { tradeRoutes, } from "../trade";
import { usersRoutes, } from "../users";
import { vnGenerateRoutes, } from "../vn-generate";
import { worldImportRoutes, } from "../world-import";
import { worldInvitesRoutes, } from "../world-invites";
import { worldLoreEntriesRoutes, } from "../world-lore-entries";
import { worldsRoutes, } from "../worlds";

import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { versionedOpenApiPlugin, } from "./openapi";

/**
 * Create v1 versioned routes.
 *
 * All route plugins are called with `prefix = "/api/v1"` so they register
 * their routes under `/api/v1/...` instead of the default `/api/...`.
 * @param opts
 */
export function v1Routes(opts: RegisterPluginsOpts,) {
  const { database, config, } = opts;
  const handleOpts = { database, config, };
  const prefix = "/api/v1";

  // NOTE: this chain is split into section consts on purpose -- one expression of
  // this size exceeds TypeScript's instantiation depth (TS2589 in the typecheck gate).
  const base = new Elysia({ name: "v1", },)
    // MUST be registered BEFORE the route plugins: Elysia's onAfterHandle
    // only wraps routes declared after the hook (proven by probe test).
    .onAfterHandle(
      deprecationAfterHandle({
        enabled: () => process.env.API_V1_DEPRECATED === "1",
        deprecatedVersion: "1",
        successorVersion: "2",
        sunset: "Sat, 01 Jan 2028 00:00:00 GMT",
      },),
    )
    .use(versionResolver(),)
    // ── Public surfaces ──────────────────────────────────────
    .use(healthRoutes(handleOpts, prefix,),)
    .use(authPublicRoutes(handleOpts, prefix,),)
    .use(i18nRoutes(handleOpts, prefix,),)
    .use(telemetryRoutes(handleOpts, prefix,),)
    .use(frontendLogsRoutes(prefix,),)
    .use(localInferenceRoutes(undefined, prefix,),)
    .use(ageGateRoutes({ database, }, prefix,),)
    // ── Auth-protected core ──────────────────────────────────
    .use(authProtectedRoutes({ database, }, prefix,),)
    .use(usersRoutes(handleOpts, prefix,),)
    .use(sessionsRoutes(handleOpts, prefix,),)
    .use(switchSessionRoutes(handleOpts, prefix,),)
    .use(apiKeysRoutes(handleOpts, prefix,),)
    .use(settingsRoutes(handleOpts, prefix,),)
    .use(requestStatusRoutes({ asyncStore: opts.asyncStore, }, prefix,),)
    .use(messageEncryptionRoutes(handleOpts, prefix,),)
    .use(keyManagementRoutes({ database, }, prefix,),);

  const chatSurface = base
    // ── Chats & messages ─────────────────────────────────────
    .use(chatsRoutes(handleOpts, prefix,),)
    .use(messagesRoutes(handleOpts, prefix,),)
    .use(messageReactionsRoutes(handleOpts, prefix,),)
    .use(messageSearchRoutes(handleOpts, prefix,),)
    .use(messageSeenRoutes({ database, }, prefix,),)
    .use(musicLinksRoutes(handleOpts, prefix,),)
    .use(chatSearchRoutes(handleOpts, prefix,),)
    .use(chatSectionsRoutes(handleOpts, prefix,),)
    .use(chatBackgroundsRoutes(handleOpts, prefix,),)
    .use(chatPinRoutes(handleOpts, prefix,),)
    .use(chatExportRoutes(handleOpts, prefix,),)
    .use(chatContextRoutes(handleOpts, prefix,),)
    .use(invitesRoutes(handleOpts, prefix,),)
    .use(worldInvitesRoutes(handleOpts, prefix,),)
    .use(vnGenerateRoutes({ database, config, }, prefix,),);

  const actorSurface = chatSurface
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

  const contentSurface = actorSurface
    // ── Generation & assets ──────────────────────────────────
    .use(generationRoutes({ database, config, }, prefix,),)
    .use(loraRoutes({ config, }, prefix,),)
    .use(assetRoutes({ database, config, }, prefix,),)
    .use(assetSearchRoutes(handleOpts, prefix,),)
    .use(assetTagRoutes({ database, }, prefix,),)
    .use(gifSearchRoutes(handleOpts, prefix,),)
    .use(imageEditRoutes({ database, }, prefix,),)
    // ── Social / content ─────────────────────────────────────
    .use(personaRoutes({ database, }, prefix,),)
    .use(nsfwRoutes(handleOpts, prefix,),)
    .use(nsfwModerationRoutes(handleOpts, prefix,),)
    .use(activityRoutes(handleOpts, prefix,),)
    .use(activityStreamRoutes(handleOpts, prefix,),)
    .use(notificationsRoutes(handleOpts, prefix,),)
    .use(proactiveMessagingRoutes(handleOpts, prefix,),)
    .use(blogRoutes({ database, }, prefix,),)
    .use(analyticsRoutes({ database, }, prefix,),)
    .use(modelComparisonsRoutes({ database, }, prefix,),);

  return contentSurface
    // ── Admin & plugins ──────────────────────────────────────
    .use(adminRoutes(handleOpts, prefix,),)
    .use(sdTemplatesRoutes(handleOpts, prefix,),)
    .use(pluginRoutes(handleOpts, prefix,),)
    .use(adminCharacterOverridesRoutes(handleOpts, prefix,),)
    .use(adminTemplateRoutes({ database, }, prefix,),)
    .use(adminNsfwRoutes({ database, }, prefix,),)
    .use(commandsRoutes({ prefix, },),)
    // ── Import / export ──────────────────────────────────────
    .use(importRoutes(handleOpts, prefix,),)
    .use(exportRoutes({ database, }, prefix,),)
    .use(exportSseRoutes({ database, }, prefix,),)
    .use(worldImportRoutes(handleOpts, prefix,),)
    .use(versionedOpenApiPlugin({ version: "1", },),);
}
