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

import { Elysia } from "elysia";
import { BunAdapter } from "elysia/adapter/bun";
import type { Db } from "./db";
import type { Config } from "./config/schema";
import { handleApiRequest } from "./server";
import { viewRoutes } from "./routes/views";
import { healthRoutes } from "./routes/health";
import { authPublicRoutes, authProtectedRoutes } from "./routes/auth";
import { settingsRoutes } from "./routes/settings";
import { activityRoutes } from "./routes/activity";
import { activityStreamRoutes } from "./routes/activity-stream";
import { apiKeysRoutes } from "./routes/api-keys";
import { frontendLogsRoutes } from "./routes/frontend-logs";
import { messageEncryptionRoutes } from "./routes/message-encryption";
import { usersRoutes } from "./routes/users";
import { actorItemsRoutes } from "./routes/actor-items";
import { actorMemoriesRoutes } from "./routes/actor-memories";
import { actorLoreEntriesRoutes } from "./routes/actor-lore-entries";
import { actorNotesRoutes } from "./routes/actor-notes";
import { worldLoreEntriesRoutes } from "./routes/world-lore-entries";
import { worldsRoutes } from "./routes/worlds";
import { adminRoutes } from "./routes/admin";
import { storyTurnsRoutes } from "./routes/story-turns";
import { storyStatesRoutes } from "./routes/story-states";
import { storyItemsRoutes } from "./routes/story-items";
import { questsRoutes } from "./routes/quests";
import { charactersRoutes } from "./routes/characters";
import { messagesRoutes } from "./routes/messages";
import { telemetryRoutes } from "./routes/telemetry";
import { chatsRoutes } from "./routes/chats";
import { pluginRoutes } from "./routes/plugins";
import { importRoutes } from "./routes/import";
import { personaRoutes } from "./personas/controller";
import { generationRoutes } from "./generation/controller";
import { ageGateRoutes } from "./age-gate/controller";
import { assetRoutes } from "./assets/controller";
import { authenticate } from "./middleware/auth";
import { onValidationError } from "./validation";

export interface AppDeps {
  database: Db;
  config: Config;
  handleNonApiRequest: (request: Request) => Promise<Response>;
}

export function createApp(deps: AppDeps): Elysia {
  const { database, config, handleNonApiRequest } = deps;

  const handleOpts = { database, config };

  const app = new Elysia({ adapter: BunAdapter })
    // ── Validation error handler (must be first) ─────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .onError((ctx: any) => onValidationError(ctx.code, ctx.error, ctx.set))

    // ── Authentication guard (runs before all routes, populates context) ──────
    .derive(async ({ request }) => {
      const authResult = await authenticate({ request, database, authConfig: config.auth });
      // When auth fails, we still return values (will be null)
      // Route handlers check for userId === null and return 401
      if (authResult instanceof Response) {
        return { userId: null, userRole: null, sessionId: null };
      }
      return {
        userId: authResult.context.userId,
        userRole: authResult.context.userRole,
        sessionId: authResult.context.sessionId,
      };
    });

  // ── Public routes (auth runs but won't block) ───────────────────────────────
  app.use(authPublicRoutes(handleOpts));
  app.use(healthRoutes(handleOpts));
  app.use(telemetryRoutes(handleOpts));
  app.use(frontendLogsRoutes());

  // ── Auth protected routes ───────────────────────────────────────────────────
  app.use(authProtectedRoutes({ database: handleOpts.database }));

  // ── Migrated route modules ───────────────────────────────────────────────────
  app.use(activityRoutes(handleOpts));
  app.use(activityStreamRoutes(handleOpts));
  app.use(apiKeysRoutes(handleOpts));
  app.use(settingsRoutes(handleOpts));
  app.use(messageEncryptionRoutes(handleOpts));
  app.use(usersRoutes(handleOpts));
  app.use(actorItemsRoutes(handleOpts));
  app.use(actorMemoriesRoutes(handleOpts));
  app.use(actorLoreEntriesRoutes(handleOpts));
  app.use(actorNotesRoutes(handleOpts));
  app.use(worldLoreEntriesRoutes(handleOpts));
  app.use(worldsRoutes(handleOpts));
  app.use(adminRoutes(handleOpts));
  app.use(pluginRoutes(handleOpts));
  app.use(storyTurnsRoutes(handleOpts));
  app.use(storyStatesRoutes(handleOpts));
  app.use(storyItemsRoutes(handleOpts));
  app.use(questsRoutes(handleOpts));
  app.use(charactersRoutes(handleOpts));
  app.use(messagesRoutes(handleOpts));
  app.use(chatsRoutes(handleOpts));
  app.use(personaRoutes(handleOpts));
  app.use(generationRoutes(handleOpts));
  app.use(ageGateRoutes(handleOpts));
  app.use(assetRoutes(handleOpts));
  app.use(importRoutes(handleOpts));
  app.use(viewRoutes({ database: handleOpts.database }));

  // ── Catch-all: delegate to existing dispatch logic ───────────────────────────
  app.all("/*", async ({ request }) => {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest({ request, database: handleOpts.database, config: handleOpts.config });
    }

    return handleNonApiRequest(request);
  });

  return app as unknown as Elysia;
}
