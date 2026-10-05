// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { pskCipher, } from "./cipher";
import { type ContentEnvelope, sealContent, } from "./envelope";
import {
  markOutboxDone,
  type MeshOutboxPassSummary,
  OUTBOX_MAX_ATTEMPTS,
  queueOutboxRetry,
  runMeshOutboxPass,
} from "./outbox";
import type { PeerPost, } from "./peer-fetch";

const cipher = pskCipher("outbox-test-psk",);
const TARGET = "https://peer.example";
const BROKEN = "https://broken.example";
const SENDER = "https://a.example";
// Fixed drain clock. It sits far enough ahead that a row just stamped by
// queueOutboxRetry (which reads the real clock) is always due, while every
// backoff assertion stays exact and wall-clock independent.
const T0 = Date.parse("2100-01-01T00:00:00.000Z",);

/** One captured POST: target route plus the decoded request body. */
interface RecordedPost {
  url: string;
  body: Record<string, unknown>;
}

/** Canned reply for one POST. */
type Reply = { ok: boolean; status: number; body: unknown };

/**
 * Transport stub that records every POST and replays canned replies, so a
 * drain pass is exercised end to end without touching the network.
 */
function recordingPost(respond: (url: string, body: Record<string, unknown>,) => Reply,): {
  post: PeerPost;
  calls: RecordedPost[];
} {
  const calls: RecordedPost[] = [];
  const post: PeerPost = async (url: string, body: unknown,) => {
    const decoded = (body ?? {}) as Record<string, unknown>;
    calls.push({ url, body: decoded, },);
    return respond(url, decoded,);
  };

  return { post, calls, };
}

const GRANT = (id: string,): Reply => ({ ok: true, status: 200, body: { reservationId: id, }, });
const ACCEPT = (verdict = "stored",): Reply => ({ ok: true, status: 200, body: { verdict, }, });
const REFUSE = (status: number,): Reply => ({ ok: false, status, body: { message: "refused", }, });

/** A healthy peer: grants a reservation, then accepts the delivery. */
const HEALTHY = (url: string,) => url.endsWith("/api/mesh-reserve",) ? GRANT("r-fresh",) : ACCEPT();
/** A peer that refuses every reservation (capacity exhausted). */
const NO_CAPACITY = (url: string,) => url.endsWith("/api/mesh-reserve",) ? REFUSE(409,) : ACCEPT();
/** A peer that grants capacity but rejects the delivery. */
const DELIVER_REFUSES = (url: string,) => url.endsWith("/api/mesh-reserve",) ? GRANT("r-fresh",) : REFUSE(500,);

async function sealed(id = "content-1", content = "hello mesh",): Promise<ContentEnvelope> {
  return sealContent({ id, origin: SENDER, clock: 1_000, content, cipher, },);
}

/**
 * Drive passes until the row is retired. A poisoned envelope still costs an
 * attempt per pass, so it dead-letters through the normal threshold rather
 * than instantly; this walks the clock to each scheduled retry.
 */
async function drainUntilDead(
  db: Kysely<DB>,
  target: string,
  contentId: string,
  post: PeerPost,
): Promise<MeshOutboxPassSummary> {
  let now = T0;
  let summary: MeshOutboxPassSummary | undefined;
  for (let pass = 0; pass < OUTBOX_MAX_ATTEMPTS; pass++) {
    summary = await runMeshOutboxPass(db, { postImpl: post, now, baseBackoffMs: 1_000, },);
    now = Date.parse((await outboxRow(db, target, contentId,)).next_attempt_at,);
  }

  return summary!;
}

/** Fetch the single outbox row for a (target, content) pair. */
async function outboxRow(
  db: Kysely<DB>,
  target: string,
  contentId: string,
): Promise<{ status: string; attempts: number; next_attempt_at: string }> {
  const found = await db
    .selectFrom("mesh_outbox",)
    .select(["status", "attempts", "next_attempt_at",],)
    .where("target_origin", "=", target,)
    .where("content_id", "=", contentId,)
    .executeTakeFirst();

  if (!found) { throw new Error(`no outbox row for ${target} ${contentId}`,); }
  return found;
}

describe("queueOutboxRetry", () => {
  test("re-queueing the same target and content upserts one row", async () => {
    const { db, } = await createTestDb();
    const first = await sealed("content-1", "first payload",);
    const second = await sealed("content-1", "second payload",);

    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope: first, },);
    await db.updateTable("mesh_outbox",).set({ status: "dead", attempts: 7, },).execute();
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope: second, },);

    const rows = await db
      .selectFrom("mesh_outbox",)
      .select(["status", "attempts", "envelope",],)
      .where("target_origin", "=", TARGET,)
      .execute();

    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.status,).toBe("pending",);
    expect(rows[0]!.attempts,).toBe(0,);
    // The refreshed push supersedes the earlier one.
    expect(JSON.parse(rows[0]!.envelope,).ciphertext,).toBe(second.ciphertext,);
  });

  test("distinct targets for one content keep separate rows", async () => {
    const { db, } = await createTestDb();
    const envelope = await sealed();
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope, },);
    await queueOutboxRetry(db, { targetOrigin: BROKEN, contentId: "content-1", envelope, },);

    const rows = await db.selectFrom("mesh_outbox",).select("target_origin",).execute();
    expect(rows.map((r,) => r.target_origin).sort(),).toEqual([TARGET, BROKEN,].sort(),);
  });

  test("markOutboxDone flips a pending row", async () => {
    const { db, } = await createTestDb();
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope: await sealed(), },);
    await markOutboxDone(db, TARGET, "content-1",);

    expect((await outboxRow(db, TARGET, "content-1",)).status,).toBe("done",);
  });

  test("markOutboxDone on an absent row is a no-op", async () => {
    const { db, } = await createTestDb();
    await markOutboxDone(db, TARGET, "never-queued",);

    expect(await db.selectFrom("mesh_outbox",).select("id",).execute(),).toHaveLength(0,);
  });
});

describe("runMeshOutboxPass", () => {
  test("a due retry is re-reserved, delivered, and flipped to done", async () => {
    const { db, } = await createTestDb();
    const envelope = await sealed();
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope, },);
    const { post, calls, } = recordingPost(HEALTHY,);

    const summary = await runMeshOutboxPass(db, { postImpl: post, now: T0, },);

    expect(summary,).toEqual({ checked: 1, delivered: 1, retried: 0, dead: 0, },);
    expect((await outboxRow(db, TARGET, "content-1",)).status,).toBe("done",);
    // The receiver answers 400 to a reservation-less deliver, so the drain
    // must reserve first and then push the grant it just obtained.
    expect(calls.map((c,) => c.url),).toEqual([
      `${TARGET}/api/mesh-reserve`,
      `${TARGET}/api/mesh-deliver`,
    ],);

    expect(calls[0]!.body,).toEqual({
      senderOrigin: SENDER,
      contentHash: envelope.hash,
      sizeBytes: envelope.size,
      contentType: envelope.type,
      ttlMs: 600_000,
    },);

    expect(calls[1]!.body.reservationId,).toBe("r-fresh",);
    expect((calls[1]!.body.envelope as ContentEnvelope).id,).toBe("content-1",);
  });

  test("a failing peer backs off, increments attempts, and is not retried early", async () => {
    const { db, } = await createTestDb();
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope: await sealed(), },);

    const first = await runMeshOutboxPass(db, {
      postImpl: recordingPost(DELIVER_REFUSES,).post,
      now: T0,
      baseBackoffMs: 1_000,
    },);

    expect(first,).toEqual({ checked: 1, delivered: 0, retried: 1, dead: 0, },);
    const after = await outboxRow(db, TARGET, "content-1",);
    expect(after.attempts,).toBe(1,);
    expect(Date.parse(after.next_attempt_at,),).toBe(T0 + 1_000,);

    // Not due yet: a healthy peer must not be contacted before the backoff.
    const earlyPost = recordingPost(HEALTHY,);
    const early = await runMeshOutboxPass(db, { postImpl: earlyPost.post, now: T0 + 999, },);
    expect(early,).toEqual({ checked: 0, delivered: 0, retried: 0, dead: 0, },);
    expect(earlyPost.calls,).toHaveLength(0,);
    expect((await outboxRow(db, TARGET, "content-1",)).attempts,).toBe(1,);

    // Doubling backoff: the second failure schedules 2x further out.
    const second = await runMeshOutboxPass(db, {
      postImpl: recordingPost(DELIVER_REFUSES,).post,
      now: T0 + 1_000,
      baseBackoffMs: 1_000,
    },);

    expect(second.retried,).toBe(1,);
    const after2 = await outboxRow(db, TARGET, "content-1",);
    expect(after2.attempts,).toBe(2,);
    expect(Date.parse(after2.next_attempt_at,),).toBe(T0 + 1_000 + 2_000,);
  });

  test("a failed reservation counts as a failed attempt, not a delivery", async () => {
    const { db, } = await createTestDb();
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope: await sealed(), },);
    const { post, calls, } = recordingPost(NO_CAPACITY,);

    const summary = await runMeshOutboxPass(db, { postImpl: post, now: T0, baseBackoffMs: 1_000, },);

    expect(summary,).toEqual({ checked: 1, delivered: 0, retried: 1, dead: 0, },);
    const after = await outboxRow(db, TARGET, "content-1",);
    expect(after.status,).toBe("pending",);
    expect(after.attempts,).toBe(1,);
    expect(Date.parse(after.next_attempt_at,),).toBe(T0 + 1_000,);
    // The peer refused capacity, so no deliver was ever attempted.
    expect(calls.map((c,) => c.url),).toEqual([`${TARGET}/api/mesh-reserve`,],);
  });

  test("a reservation that expires mid-backoff does not block the row from delivering", async () => {
    const { db, } = await createTestDb();
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope: await sealed(), },);

    await runMeshOutboxPass(db, {
      postImpl: recordingPost(DELIVER_REFUSES,).post,
      now: T0,
      baseBackoffMs: 1_000,
    },);

    // Long past the 10-minute reservation TTL the first pass would have
    // held: the drain must still deliver by taking a fresh grant.
    const later = T0 + 86_400_000;
    const { post, calls, } = recordingPost(HEALTHY,);
    const summary = await runMeshOutboxPass(db, { postImpl: post, now: later, },);

    expect(summary.delivered,).toBe(1,);
    expect((await outboxRow(db, TARGET, "content-1",)).status,).toBe("done",);
    expect(calls[1]!.body.reservationId,).toBe("r-fresh",);
  });

  test("a row dead-letters once attempts reach the maximum", async () => {
    const { db, } = await createTestDb();
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope: await sealed(), },);
    const { post, } = recordingPost(DELIVER_REFUSES,);

    let now = T0;
    let last: MeshOutboxPassSummary | undefined;
    for (let pass = 0; pass < OUTBOX_MAX_ATTEMPTS; pass++) {
      last = await runMeshOutboxPass(db, { postImpl: post, now, baseBackoffMs: 1_000, },);
      now = Date.parse((await outboxRow(db, TARGET, "content-1",)).next_attempt_at,);
    }

    expect(last,).toEqual({ checked: 1, delivered: 0, retried: 0, dead: 1, },);
    const retired = await outboxRow(db, TARGET, "content-1",);
    expect(retired.status,).toBe("dead",);
    expect(retired.attempts,).toBe(OUTBOX_MAX_ATTEMPTS,);

    // A dead row is never picked up again, however far the clock moves.
    const postmortem = await runMeshOutboxPass(db, { postImpl: post, now: now + 86_400_000, },);
    expect(postmortem,).toEqual({ checked: 0, delivered: 0, retried: 0, dead: 0, },);
  });

  test("a row with an unparseable envelope is retired without any network call", async () => {
    const { db, } = await createTestDb();
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope: await sealed(), },);
    await db.updateTable("mesh_outbox",).set({ envelope: "not json at all", },).execute();
    const { post, calls, } = recordingPost(HEALTHY,);

    const summary = await drainUntilDead(db, TARGET, "content-1", post,);

    expect(summary,).toEqual({ checked: 1, delivered: 0, retried: 0, dead: 1, },);
    expect((await outboxRow(db, TARGET, "content-1",)).status,).toBe("dead",);
    // Nothing was ever pushable, so the peer was never contacted.
    expect(calls,).toHaveLength(0,);
  });

  test("envelope JSON lacking envelope fields is retired without a network call", async () => {
    const { db, } = await createTestDb();
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope: await sealed(), },);
    // Parses as JSON, but carries no ciphertext to push.
    await db.updateTable("mesh_outbox",).set({ envelope: '{"id":"content-1"}', },).execute();
    const { post, calls, } = recordingPost(HEALTHY,);

    const summary = await drainUntilDead(db, TARGET, "content-1", post,);

    expect(summary.dead,).toBe(1,);
    expect(summary.delivered,).toBe(0,);
    expect(calls,).toHaveLength(0,);
  });

  test("one row's failure never blocks the rest of the pass", async () => {
    const { db, } = await createTestDb();
    await queueOutboxRetry(db, { targetOrigin: BROKEN, contentId: "c1", envelope: await sealed("c1",), },);
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "c2", envelope: await sealed("c2",), },);
    const { post, calls, } = recordingPost((url,) =>
      url === `${BROKEN}/api/mesh-reserve`
        ? REFUSE(503,)
        : url.endsWith("/api/mesh-reserve",)
        ? GRANT("r-fresh",)
        : ACCEPT()
    );

    const summary = await runMeshOutboxPass(db, { postImpl: post, now: T0, },);

    expect(summary,).toEqual({ checked: 2, delivered: 1, retried: 1, dead: 0, },);
    expect((await outboxRow(db, BROKEN, "c1",)).status,).toBe("pending",);
    expect((await outboxRow(db, TARGET, "c2",)).status,).toBe("done",);
    expect(calls.filter((c,) => c.url === `${TARGET}/api/mesh-deliver`),).toHaveLength(1,);
  });

  test("batch caps the due rows handled per pass", async () => {
    const { db, } = await createTestDb();
    for (const id of ["c1", "c2", "c3",]) {
      await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: id, envelope: await sealed(id,), },);
    }

    const { post, calls, } = recordingPost(HEALTHY,);

    const summary = await runMeshOutboxPass(db, { postImpl: post, now: T0, batch: 2, },);

    expect(summary.checked,).toBe(2,);
    expect(summary.delivered,).toBe(2,);
    expect(calls,).toHaveLength(4,);
    // The third row stays pending for a later pass.
    const pending = await db
      .selectFrom("mesh_outbox",)
      .select("status",)
      .where("status", "=", "pending",)
      .execute();

    expect(pending,).toEqual([{ status: "pending", },],);
  });

  test("a stale verdict counts as a delivery", async () => {
    const { db, } = await createTestDb();
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope: await sealed(), },);
    const { post, } = recordingPost((url,) =>
      url.endsWith("/api/mesh-reserve",) ? GRANT("r-fresh",) : ACCEPT("stale",)
    );

    const summary = await runMeshOutboxPass(db, { postImpl: post, now: T0, },);

    expect(summary.delivered,).toBe(1,);
    expect((await outboxRow(db, TARGET, "content-1",)).status,).toBe("done",);
  });

  test("an already-done row is skipped by the due query", async () => {
    const { db, } = await createTestDb();
    await queueOutboxRetry(db, { targetOrigin: TARGET, contentId: "content-1", envelope: await sealed(), },);
    await markOutboxDone(db, TARGET, "content-1",);
    const { post, calls, } = recordingPost(HEALTHY,);

    const summary = await runMeshOutboxPass(db, { postImpl: post, now: T0, },);

    expect(summary.checked,).toBe(0,);
    expect(calls,).toHaveLength(0,);
  });
});
