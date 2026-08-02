/**
 * Elysia App Builder
 *
 * Creates the Elysia HTTP application. Public routes and migrated
 * route modules are registered first. Everything else falls through
 * to the catch-all handler which delegates to the existing dispatch
 * logic (handleApiRequest, static files).
 *
 * Uses closure injection (not .state()/.decorate()) to avoid Elysia's
 * complex type inference issues when merging plugins.
 */
import { Elysia, } from "elysia";
import { BunAdapter, } from "elysia/adapter/bun";
import { ageGateRoutes, } from "./age-gate/controller";
import { assetRoutes, } from "./assets/controller";
import type { Config, } from "./config/schema";
import type { Db, } from "./db";
import { generationRoutes, } from "./generation/controller";
// TODO: Wire LoRA routes when feature is ready for production
// import { loraRoutes, } from "./generation/lora/routes";
import { authenticate, } from "./middleware/auth";
import { createI18nContext, detectLocale, } from "./middleware/i18n";
import { personaRoutes, } from "./personas/controller";
import { activityRoutes, } from "./routes/activity";
import { activityStreamRoutes, } from "./routes/activity-stream";
import { actorItemsRoutes, } from "./routes/actor-items";
import { actorLoreEntriesRoutes, } from "./routes/actor-lore-entries";
import { actorMemoriesRoutes, } from "./routes/actor-memories";
import { actorNotesRoutes, } from "./routes/actor-notes";
import { adminRoutes, } from "./routes/admin";
import { adminCharacterOverridesRoutes, } from "./routes/admin-character-overrides";
import { adminNsfwRoutes, } from "./routes/admin-nsfw";
import { adminTemplateRoutes, } from "./routes/admin-templates";
import { apiKeysRoutes, } from "./routes/api-keys";
import { authProtectedRoutes, authPublicRoutes, } from "./routes/auth";
import { characterAvailabilityRoutes, } from "./routes/character-availability";
import { characterAvatarsRoutes, } from "./routes/character-avatars";
import { characterEmotionAvatarsRoutes, } from "./routes/character-emotion-avatars";
import { characterEmotionsRoutes, } from "./routes/character-emotions";
import { characterIoRoutes, } from "./routes/character-io";
import { characterLicensingRoutes, } from "./routes/character-licensing";
import { characterMoodRoutes, } from "./routes/character-mood";
import { characterRelationshipsRoutes, } from "./routes/character-relationships";
import { characterTraitsRoutes, } from "./routes/character-traits";
import { charactersRoutes, } from "./routes/characters";
import { chatBackgroundsRoutes, } from "./routes/chat-backgrounds";
import { chatContextRoutes, } from "./routes/chat-context";
import { chatExportRoutes, } from "./routes/chat-export";
import { chatPinRoutes, } from "./routes/chat-pins";
import { chatSearchRoutes, } from "./routes/chat-search";
import { chatSectionsRoutes, } from "./routes/chat-sections";
import { chatsRoutes, } from "./routes/chats";
import { invitesRoutes, } from "./routes/invites";
import { frontendLogsRoutes, } from "./routes/frontend-logs";
import { gmNotesRoutes, } from "./routes/gm-notes";
import { healthRoutes, } from "./routes/health";
import { i18nRoutes, } from "./routes/i18n";
import { importRoutes, } from "./routes/import";
import { keyManagementRoutes, } from "./routes/key-management";
import { locationExplorerRoutes, } from "./routes/location-explorer";
import { messageEncryptionRoutes, } from "./routes/message-encryption";
import { messageReactionsRoutes, } from "./routes/message-reactions";
import { messagesRoutes, } from "./routes/messages";
import { notificationsRoutes, } from "./routes/notifications";
import { nsfwRoutes, } from "./routes/nsfw";
import { nsfwModerationRoutes, } from "./routes/nsfw-moderation";
import { pluginRoutes, } from "./routes/plugins";
import { questsRoutes, } from "./routes/quests";
import { rpgRoutes, } from "./routes/rpg";
import { sessionsRoutes, } from "./routes/sessions";
import { settingsRoutes, } from "./routes/settings";
import { storyItemsRoutes, } from "./routes/story-items";
import { storyStatesRoutes, } from "./routes/story-states";
import { storyTurnsRoutes, } from "./routes/story-turns";
import { telemetryRoutes, } from "./routes/telemetry";
import { usersRoutes, } from "./routes/users";
import { viewRoutes, } from "./routes/views";
import { vnChoiceRoutes, } from "./routes/vn-choices";
import { vnGenerateRoutes, } from "./routes/vn-generate";
import { worldLoreEntriesRoutes, } from "./routes/world-lore-entries";
import { worldsRoutes, } from "./routes/worlds";
import { handleApiRequest, } from "./server";
import { onValidationError, } from "./validation";

export interface AppDeps {
  database: Db;
  config: Config;
  handleNonApiRequest: (request: Request,) => Promise<Response>;
}

export function createApp(deps: AppDeps,): Elysia {
  const { database, config, handleNonApiRequest, } = deps;

  const handleOpts = { database, config, };

  const app = new Elysia({ adapter: BunAdapter, },)
    // ── Validation error handler (must be first) ─────────────

    .onError((ctx: any,) => onValidationError(ctx.code, ctx.error, ctx.set,))
    // ── Authentication guard (runs before all routes, populates context) ──────
    .derive(async ({ request, },) => {
      const authResult = await authenticate({ request, database, authConfig: config.auth, },);
      // When auth fails, we still return values (will be null)
      // Route handlers check for userId === null and return 401
      if (authResult instanceof Response) {
        // Still detect locale even when auth fails
        const locale = detectLocale(request,);
        const i18n = createI18nContext(locale,);
        return { userId: null, userRole: null, sessionId: null, ...i18n, };
      }
      // Detect locale and create translator
      const locale = detectLocale(request,);
      const i18n = createI18nContext(locale,);
      return {
        userId: authResult.context.userId,
        userRole: authResult.context.userRole,
        sessionId: authResult.context.sessionId,
        ...i18n,
      };
    },);

  // ── Public routes (auth runs but won't block) ───────────────────────────────
  app.use(authPublicRoutes(handleOpts,),);
  app.use(healthRoutes(handleOpts,),);
  app.use(i18nRoutes(handleOpts,),);
  app.use(telemetryRoutes(handleOpts,),);
  app.use(frontendLogsRoutes(),);

  // ── Auth protected routes ───────────────────────────────────────────────────
  app.use(authProtectedRoutes({ database: handleOpts.database, },),);

  // ── Migrated route modules ───────────────────────────────────────────────────
  app.use(activityRoutes(handleOpts,),);
  app.use(activityStreamRoutes(handleOpts,),);
  app.use(notificationsRoutes(handleOpts,),);
  app.use(apiKeysRoutes(handleOpts,),);
  app.use(settingsRoutes(handleOpts,),);
  app.use(messageEncryptionRoutes(handleOpts,),);
  app.use(keyManagementRoutes({ database: handleOpts.database, },),);
  app.use(usersRoutes(handleOpts,),);
  app.use(sessionsRoutes(handleOpts,),);
  app.use(actorItemsRoutes(handleOpts,),);
  app.use(actorMemoriesRoutes(handleOpts,),);
  app.use(actorLoreEntriesRoutes(handleOpts,),);
  app.use(actorNotesRoutes(handleOpts,),);
  app.use(worldLoreEntriesRoutes(handleOpts,),);
  app.use(worldsRoutes(handleOpts,),);
  app.use(chatSectionsRoutes(handleOpts,),);
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
  app.use(messageReactionsRoutes(handleOpts,),);
  app.use(chatsRoutes(handleOpts,),);
  app.use(chatSearchRoutes(handleOpts,),);
  app.use(invitesRoutes(handleOpts,),);
  app.use(gmNotesRoutes(handleOpts,),);
  app.use(vnChoiceRoutes({ database: handleOpts.database, },),);
  app.use(vnGenerateRoutes({ database: handleOpts.database, config, },),);
  app.use(chatPinRoutes(handleOpts,),);
  app.use(chatExportRoutes(handleOpts,),);
  app.use(chatContextRoutes(handleOpts,),);
  app.use(importRoutes(handleOpts,),);
  app.use(personaRoutes(handleOpts,),);
  app.use(generationRoutes(handleOpts,),);
  // TODO: Enable when LoRA feature is ready for production
  // app.use(loraRoutes({ config, }),);
  app.use(ageGateRoutes(handleOpts,),);
  app.use(nsfwRoutes(handleOpts,),);
  app.use(nsfwModerationRoutes(handleOpts,),);
  app.use(assetRoutes(handleOpts,),);
  app.use(rpgRoutes(handleOpts,),);
  app.use(viewRoutes({ database: handleOpts.database, },),);

  // ── Asset upload (standalone route) ──────────────────────────
  // WORKAROUND: Elysia 1.4.x body consumption bug. When a child plugin
  // containing routes that call request.json() is .use()d into a parent,
  // Elysia's internal body parser consumes the multipart body stream before
  // the upload handler can call request.formData(). Registering the multipart
  // route directly on the parent app avoids this issue.
  // See: https://github.com/elysiajs/elysia/issues/XXX (if filed)
  app.post("/api/assets", async (ctx: any,) => {
    const userId = ctx.userId as string | null;
    if (!userId) {
      const { unauthorizedResponse, } = await import("./routes/http-utils");
      return unauthorizedResponse();
    }
    if (!config.assets.enabled) {
      const { notFoundResponse, } = await import("./routes/http-utils");
      return notFoundResponse("Asset system is disabled",);
    }
    const { handleUpload, } = await import("./assets/controller");
    return handleUpload({
      request: ctx.request,
      userId,
      database,
      uploadDir: config.assets.uploadDir,
      maxFileSize: config.assets.maxFileSize,
    },);
  },);

  // ── Convenience redirects ─────────────────────────────────────
  const redirectTo = (location: string,): Response =>
    new Response(null, { status: 302, headers: { Location: location, }, },);

  // Authenticated users land on the chat; everyone else on the login screen.
  app.get("/", (ctx: any,) => redirectTo(ctx.userId ? "/views/chat" : "/views/login",),);
  app.get("/chat", (ctx: any,) => redirectTo(ctx.userId ? "/views/chat" : "/views/login",),);
  app.get("/register", (ctx: any,) => redirectTo(ctx.userId ? "/views/chat" : "/views/register",),);

  // ── Catch-all: delegate to existing dispatch logic ───────────────────────────
  app.all("/*", async ({ request, },) => {
    const url = new URL(request.url,);

    if (url.pathname.startsWith("/api/",)) {
      return handleApiRequest({ request, database: handleOpts.database, config: handleOpts.config, },);
    }

    return handleNonApiRequest(request,);
  },);

  return app as unknown as Elysia;
}
