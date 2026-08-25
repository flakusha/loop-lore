/**
 * Route tests for the user-moderation action endpoints:
 *   POST /api/nsfw/moderation/{block,unblock,ban,unban,shadow,unshadow}
 *
 * All six require `moderation.action` (granted to `moderator`) OR
 * `admin.system` (admin/solo/tester). Other roles are denied with 403.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { actionsRoutes, } from "./actions";

function createApp(db: Kysely<DB>, userId: string | null, role = "user",): Elysia {
  return new Elysia({ name: "test-actions", },)
    .derive(() => ({ userId, userRole: role, }))
    .use(actionsRoutes({ database: db, },),) as unknown as Elysia;
}

function actionRequest(path: string, body: Record<string, unknown>,): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("moderation action routes — moderator gating", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  const blockBody = { targetUserId: "u-target", reason: "spam", };
  const unblockBody = { targetUserId: "u-target", };
  const modBody = { targetUserId: "u-target", reason: "abuse", };

  const paths = [
    ["/api/nsfw/moderation/block", blockBody,],
    ["/api/nsfw/moderation/unblock", unblockBody,],
    ["/api/nsfw/moderation/ban", modBody,],
    ["/api/nsfw/moderation/unban", modBody,],
    ["/api/nsfw/moderation/shadow", modBody,],
    ["/api/nsfw/moderation/unshadow", modBody,],
  ] as const;

  for (const [path, body,] of paths) {
    test(`${path} requires auth`, async () => {
      const app = createApp(db, null, "moderator",);
      const res = await app.handle(actionRequest(path, body,),);
      expect(res.status,).toBe(401,);
    });

    test(`${path} denies user role`, async () => {
      const app = createApp(db, uid(), "user",);
      const res = await app.handle(actionRequest(path, body,),);
      expect(res.status,).toBe(403,);
    });

    test(`${path} denies viewer role`, async () => {
      const app = createApp(db, uid(), "viewer",);
      const res = await app.handle(actionRequest(path, body,),);
      expect(res.status,).toBe(403,);
    });

    test(`${path} denies creator role`, async () => {
      const app = createApp(db, uid(), "creator",);
      const res = await app.handle(actionRequest(path, body,),);
      expect(res.status,).toBe(403,);
    });

    test(`${path} accepts moderator role (auth passes; handler may 4xx on body)`, async () => {
      const app = createApp(db, uid(), "moderator",);
      const res = await app.handle(actionRequest(path, body,),);
      // 403 = blocked at guard (would be a fail); anything else means guard let it through.
      expect(res.status,).not.toBe(403,);
      expect(res.status,).not.toBe(401,);
    });

    test(`${path} accepts admin role`, async () => {
      const app = createApp(db, uid(), "admin",);
      const res = await app.handle(actionRequest(path, body,),);
      expect(res.status,).not.toBe(403,);
    });

    test(`${path} accepts solo role`, async () => {
      const app = createApp(db, uid(), "solo",);
      const res = await app.handle(actionRequest(path, body,),);
      expect(res.status,).not.toBe(403,);
    });

    test(`${path} accepts tester role`, async () => {
      const app = createApp(db, uid(), "tester",);
      const res = await app.handle(actionRequest(path, body,),);
      expect(res.status,).not.toBe(403,);
    });
  }

  // Regression for BUG-nsfw-modactions-performedby-from-body: even if a caller
  // sends `performedBy: <other-admin>` in the body, the route must derive it
  // from the authenticated session (ctx.userId). Verified by seeding prefs and
  // checking the recorded moderation_actions.performed_by column.
  test(`${"block"} records performedBy from session (not body claim)`, async () => {
    const caller = uid();
    const impersonated = uid();
    const targetId = uid();
    // Seed prefs so blockUser does not throw.
    await db.insertInto("nsfw_user_preferences",).values({
      id: crypto.randomUUID(),
      user_id: targetId,
      nsfw_enabled: 1,
      max_rating: "nsfw_mild",
      access_status: "clear",
      shadow_nsfw: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },).execute();
    const forged = { targetUserId: targetId, reason: "test", performedBy: impersonated, };
    const app = createApp(db, caller, "admin",);
    const res = await app.handle(actionRequest("/api/nsfw/moderation/block", forged,),);
    expect(res.status,).toBe(200,);
    const rows = await db.selectFrom("moderation_actions",)
      .selectAll()
      .where("target_user_id", "=", targetId,)
      .execute();
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.performed_by,).toBe(caller,);
    expect(rows[0]?.performed_by,).not.toBe(impersonated,);
  });
});
