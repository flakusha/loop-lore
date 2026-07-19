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
import { authenticate, } from "./middleware/auth";
import { personaRoutes, } from "./personas/controller";
import { activityRoutes, } from "./routes/activity";
import { activityStreamRoutes, } from "./routes/activity-stream";
import { actorItemsRoutes, } from "./routes/actor-items";
import { actorLoreEntriesRoutes, } from "./routes/actor-lore-entries";
import { actorMemoriesRoutes, } from "./routes/actor-memories";
import { actorNotesRoutes, } from "./routes/actor-notes";
import { adminRoutes, } from "./routes/admin";
import { apiKeysRoutes, } from "./routes/api-keys";
import { authProtectedRoutes, authPublicRoutes, } from "./routes/auth";
import { authProtectedRoutes, authPublicRoutes, } from "./routes/auth";
import { charactersRoutes, } from "./routes/characters";
import { chatExportRoutes, } from "./routes/chat-export";
import { chatPinRoutes, } from "./routes/chat-pins";
import { chatsRoutes, } from "./routes/chats";
import { frontendLogsRoutes, } from "./routes/frontend-logs";
import { healthRoutes, } from "./routes/health";
import { importRoutes, } from "./routes/import";
import { messageEncryptionRoutes, } from "./routes/message-encryption";
import { messageReactionsRoutes, } from "./routes/message-reactions";
import { messagesRoutes, } from "./routes/messages";
import { notificationsRoutes, } from "./routes/notifications";
import { pluginRoutes, } from "./routes/plugins";
import { questsRoutes, } from "./routes/quests";
import { sessionsRoutes, } from "./routes/sessions";
import { settingsRoutes, } from "./routes/settings";
import { storyItemsRoutes, } from "./routes/story-items";
import { storyStatesRoutes, } from "./routes/story-states";
import { storyTurnsRoutes, } from "./routes/story-turns";
import { telemetryRoutes, } from "./routes/telemetry";
import { usersRoutes, } from "./routes/users";
import { viewRoutes, } from "./routes/views";
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
        return { userId: null, userRole: null, sessionId: null, };
      }
      return {
        userId: authResult.context.userId,
        userRole: authResult.context.userRole,
        sessionId: authResult.context.sessionId,
      };
    },);

  // ── Public routes (auth runs but won't block) ───────────────────────────────
  app.use(authPublicRoutes(handleOpts,),);
  app.use(healthRoutes(handleOpts,),);
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
  app.use(usersRoutes(handleOpts,),);
  app.use(sessionsRoutes(handleOpts,),);
  app.use(actorItemsRoutes(handleOpts,),);
  app.use(actorMemoriesRoutes(handleOpts,),);
  app.use(actorLoreEntriesRoutes(handleOpts,),);
  app.use(actorNotesRoutes(handleOpts,),);
  app.use(worldLoreEntriesRoutes(handleOpts,),);
  app.use(worldsRoutes(handleOpts,),);
  app.use(adminRoutes(handleOpts,),);
  app.use(pluginRoutes(handleOpts,),);
  app.use(storyTurnsRoutes(handleOpts,),);
  app.use(storyStatesRoutes(handleOpts,),);
  app.use(storyItemsRoutes(handleOpts,),);
  app.use(questsRoutes(handleOpts,),);
  app.use(charactersRoutes(handleOpts,),);
  app.use(messagesRoutes(handleOpts,),);
  app.use(messageReactionsRoutes(handleOpts,),);
  app.use(chatsRoutes(handleOpts,),);
  app.use(chatPinRoutes(handleOpts,),);
  app.use(chatExportRoutes(handleOpts,),);
  app.use(importRoutes(handleOpts,),);
  app.use(personaRoutes(handleOpts,),);
  app.use(generationRoutes(handleOpts,),);
  app.use(ageGateRoutes(handleOpts,),);
  app.use(assetRoutes(handleOpts,),);
  app.use(viewRoutes({ database: handleOpts.database, },),);

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
