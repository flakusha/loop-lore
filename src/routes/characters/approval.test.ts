// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the character approval routes: submit-for-review, approve, reject
 * and the pending-reviews queue, including the auth/permission gates and the
 * service-refusal (400) paths.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { approvalRoutes, } from "./approval";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";

const DRAFT_ACTOR = "aaaaaaaa-0000-4000-8000-000000000001";
const PENDING_ACTOR = "aaaaaaaa-0000-4000-8000-000000000002";
const APPROVED_ACTOR = "aaaaaaaa-0000-4000-8000-000000000003";
const REJECT_ACTOR = "aaaaaaaa-0000-4000-8000-000000000004";
const NON_CHARACTER = "aaaaaaaa-0000-4000-8000-000000000005";
const QUEUE_ACTOR = "aaaaaaaa-0000-4000-8000-000000000006";
const NOOP_ACTOR = "aaaaaaaa-0000-4000-8000-000000000007";
const UNKNOWN_ACTOR = "aaaaaaaa-0000-4000-8000-0000000000ff";

let db: Kysely<DB>;
let sqlite: Database;

/**
 * @param database
 * @param userId
 * @param userRole
 */
function makeApp(database: Kysely<DB>, userId: string | null, userRole: string | null,) {
  const app = new Elysia({ name: "test-approval", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({ userId, userRole, }));
  return app.use(approvalRoutes({ database, },),);
}

/**
 * @param url
 * @param body
 */
function postJson(url: string, body: unknown = {},) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

/**
 * @param actorId
 */
async function reviewStateOf(actorId: string,) {
  const row = await db
    .selectFrom("actors",)
    .select("review_state",)
    .where("id", "=", actorId,)
    .executeTakeFirstOrThrow();

  return row.review_state;
}

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());

  await insertUsers(db, "owner", "Owner", { id: OWNER, },);
  await insertUsers(db, "other-owner", "Other", { id: OTHER_OWNER, },);
  await insertUsers(db, "admin", "Admin", { id: ADMIN, role: "admin", },);

  await insertActors(db, "Draft Hero", {
    id: DRAFT_ACTOR,
    actor_type: "character",
    owner_id: OWNER,
    review_state: "draft",
  },);

  await insertActors(db, "Pending Hero", {
    id: PENDING_ACTOR,
    actor_type: "character",
    owner_id: OWNER,
    review_state: "pending_review",
  },);

  await insertActors(db, "Approved Hero", {
    id: APPROVED_ACTOR,
    actor_type: "character",
    owner_id: OWNER,
    review_state: "approved",
  },);

  await insertActors(db, "Reject Hero", {
    id: REJECT_ACTOR,
    actor_type: "character",
    owner_id: OWNER,
    review_state: "pending_review",
  },);

  // Left pending for the queue listing — no other test transitions this one.
  await insertActors(db, "Queue Hero", {
    id: QUEUE_ACTOR,
    actor_type: "character",
    owner_id: OWNER,
    review_state: "pending_review",
  },);

  // Re-submitting an already-pending character is a no-op success; this actor
  // exists so that assertion does not depend on PENDING_ACTOR staying pending.
  await insertActors(db, "Noop Hero", {
    id: NOOP_ACTOR,
    actor_type: "character",
    owner_id: OWNER,
    review_state: "pending_review",
  },);

  // A persona actor — the approval queue only covers `character` actors.
  await insertActors(db, "Persona", {
    id: NON_CHARACTER,
    actor_type: "user",
    owner_id: OWNER,
  },);
},);

afterAll(() => {
  sqlite.close();
},);

describe("approval routes", () => {
  describe("anonymous caller", () => {
    test("submit-for-review returns 401", async () => {
      const app = makeApp(db, null, null,);
      const res = await app.handle(postJson(`/api/characters/${DRAFT_ACTOR}/submit-for-review`,),);
      expect(res.status,).toBe(401,);
    });

    test("approve returns 401", async () => {
      const app = makeApp(db, null, null,);
      const res = await app.handle(postJson(`/api/characters/${PENDING_ACTOR}/approve`,),);
      expect(res.status,).toBe(401,);
    });

    test("reject returns 401", async () => {
      const app = makeApp(db, null, null,);
      const res = await app.handle(postJson(`/api/characters/${REJECT_ACTOR}/reject`,),);
      expect(res.status,).toBe(401,);
    });

    test("pending-reviews returns 401", async () => {
      const app = makeApp(db, null, null,);
      const res = await app.handle(new Request("http://localhost/api/characters/pending-reviews",),);
      expect(res.status,).toBe(401,);
    });
  });

  describe("non-admin caller", () => {
    test("approve returns 403", async () => {
      const app = makeApp(db, OWNER, "user",);
      const res = await app.handle(postJson(`/api/characters/${PENDING_ACTOR}/approve`,),);
      expect(res.status,).toBe(403,);
    });

    test("reject returns 403", async () => {
      const app = makeApp(db, OWNER, "user",);
      const res = await app.handle(postJson(`/api/characters/${REJECT_ACTOR}/reject`,),);
      expect(res.status,).toBe(403,);
    });

    test("pending-reviews returns 403", async () => {
      const app = makeApp(db, OWNER, "user",);
      const res = await app.handle(new Request("http://localhost/api/characters/pending-reviews",),);
      expect(res.status,).toBe(403,);
    });

    // `creator` holds `character.*` but not `admin.character` — the admin gate
    // must not be satisfied by the broader character namespace.
    test("creator role is still refused on approve", async () => {
      const app = makeApp(db, OWNER, "creator",);
      const res = await app.handle(postJson(`/api/characters/${REJECT_ACTOR}/approve`,),);
      expect(res.status,).toBe(403,);
    });

    test("moderator role is still refused on pending-reviews", async () => {
      const app = makeApp(db, OWNER, "moderator",);
      const res = await app.handle(new Request("http://localhost/api/characters/pending-reviews",),);
      expect(res.status,).toBe(403,);
    });
  });

  describe("POST /api/characters/:id/submit-for-review", () => {
    test("refuses an unknown actor with 400", async () => {
      const app = makeApp(db, OWNER, "user",);
      const res = await app.handle(postJson(`/api/characters/${UNKNOWN_ACTOR}/submit-for-review`,),);
      expect(res.status,).toBe(400,);
      const body = await res.json() as { error: string };
      expect(body.error,).toBe("Character not found",);
    });

    test("refuses a non-owner with 400", async () => {
      const app = makeApp(db, OTHER_OWNER, "user",);
      const res = await app.handle(postJson(`/api/characters/${DRAFT_ACTOR}/submit-for-review`,),);
      expect(res.status,).toBe(400,);
      const body = await res.json() as { error: string };
      expect(body.error,).toBe("Only the owner can submit for review",);
    });

    test("refuses a non-character actor with 400", async () => {
      const app = makeApp(db, OWNER, "user",);
      const res = await app.handle(postJson(`/api/characters/${NON_CHARACTER}/submit-for-review`,),);
      expect(res.status,).toBe(400,);
      const body = await res.json() as { error: string };
      expect(body.error,).toBe("Only characters are subject to review",);
    });

    test("refuses a non-submittable state with 400", async () => {
      const app = makeApp(db, OWNER, "user",);
      const res = await app.handle(postJson(`/api/characters/${APPROVED_ACTOR}/submit-for-review`,),);
      expect(res.status,).toBe(400,);
      const body = await res.json() as { error: string };
      expect(body.error,).toBe("Cannot submit from state: approved",);
    });

    test("owner submits a draft, then approve/reject gate the second decision", async () => {
      const ownerApp = makeApp(db, OWNER, "user",);
      const submitted = await ownerApp.handle(postJson(`/api/characters/${DRAFT_ACTOR}/submit-for-review`,),);
      expect(submitted.status,).toBe(200,);
      const submittedBody = await submitted.json() as { id: string; review_state: string };
      expect(submittedBody.id,).toBe(DRAFT_ACTOR,);
      expect(submittedBody.review_state,).toBe("pending_review",);
      expect(await reviewStateOf(DRAFT_ACTOR,),).toBe("pending_review",);

      const adminApp = makeApp(db, ADMIN, "admin",);
      const approved = await adminApp.handle(
        postJson(`/api/characters/${DRAFT_ACTOR}/approve`, { reason: "looks good", },),
      );

      expect(approved.status,).toBe(200,);
      const approvedBody = await approved.json() as { id: string; review_state: string };
      expect(approvedBody.review_state,).toBe("approved",);
      expect(await reviewStateOf(DRAFT_ACTOR,),).toBe("approved",);

      const again = await adminApp.handle(postJson(`/api/characters/${DRAFT_ACTOR}/approve`,),);
      expect(again.status,).toBe(400,);
      const againBody = await again.json() as { error: string };
      expect(againBody.error,).toBe("Cannot approve from state: approved",);
    });

    test("is a no-op when the character is already pending review", async () => {
      const app = makeApp(db, OWNER, "user",);
      const res = await app.handle(postJson(`/api/characters/${NOOP_ACTOR}/submit-for-review`,),);
      expect(res.status,).toBe(200,);
      expect(await reviewStateOf(NOOP_ACTOR,),).toBe("pending_review",);
    });
  });

  describe("POST /api/characters/:id/approve", () => {
    test("refuses an unknown actor with 400", async () => {
      const app = makeApp(db, ADMIN, "admin",);
      const res = await app.handle(postJson(`/api/characters/${UNKNOWN_ACTOR}/approve`,),);
      expect(res.status,).toBe(400,);
    });

    test("refuses a non-pending character with 400", async () => {
      const app = makeApp(db, ADMIN, "admin",);
      const res = await app.handle(postJson(`/api/characters/${APPROVED_ACTOR}/approve`,),);
      expect(res.status,).toBe(400,);
      const body = await res.json() as { error: string };
      expect(body.error,).toBe("Cannot approve from state: approved",);
    });

    test("approves a pending character", async () => {
      const app = makeApp(db, ADMIN, "admin",);
      const res = await app.handle(postJson(`/api/characters/${PENDING_ACTOR}/approve`,),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { id: string; review_state: string };
      expect(body.id,).toBe(PENDING_ACTOR,);
      expect(body.review_state,).toBe("approved",);
      expect(await reviewStateOf(PENDING_ACTOR,),).toBe("approved",);
    });
  });

  describe("POST /api/characters/:id/reject", () => {
    test("refuses an unknown actor with 400", async () => {
      const app = makeApp(db, ADMIN, "admin",);
      const res = await app.handle(postJson(`/api/characters/${UNKNOWN_ACTOR}/reject`,),);
      expect(res.status,).toBe(400,);
    });

    test("rejects a pending character", async () => {
      const app = makeApp(db, ADMIN, "admin",);
      const res = await app.handle(postJson(`/api/characters/${REJECT_ACTOR}/reject`, { reason: "nope", },),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { id: string; review_state: string };
      expect(body.id,).toBe(REJECT_ACTOR,);
      expect(body.review_state,).toBe("rejected",);
      expect(await reviewStateOf(REJECT_ACTOR,),).toBe("rejected",);
    });

    test("refuses a non-pending character with 400", async () => {
      const app = makeApp(db, ADMIN, "admin",);
      const res = await app.handle(postJson(`/api/characters/${APPROVED_ACTOR}/reject`,),);
      expect(res.status,).toBe(400,);
      const body = await res.json() as { error: string };
      expect(body.error,).toBe("Cannot reject from state: approved",);
    });
  });

  describe("GET /api/characters/pending-reviews", () => {
    test("returns the pending queue for an admin", async () => {
      const app = makeApp(db, ADMIN, "admin",);
      const res = await app.handle(new Request("http://localhost/api/characters/pending-reviews",),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { data: { id: string }[]; total: number };
      expect(Array.isArray(body.data,),).toBe(true,);
      expect(body.total,).toBe(body.data.length,);
      expect(body.total,).toBeGreaterThanOrEqual(1,);
      expect(body.data.map((r,) => r.id),).toContain(QUEUE_ACTOR,);
    });
  });
});
