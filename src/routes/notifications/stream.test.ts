/**
 * Tests for routes/notifications/stream.ts — NotificationStreamer.
 *
 * Covers the SSE contract (response headers, initial notifications snapshot)
 * plus loadNotificationSnapshot's allSettled degradation: one failing query
 * resolves to its empty default instead of throwing.
 * Uses Promise.withResolvers per project rules.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { loadNotificationSnapshot, NotificationStreamer, } from "./stream";
/**
 * Decode an SSE-encoded chunk into a list of {event,data} frames.
 * @param chunk
 */
function parseFrames(chunk: string,): Array<{ event: string; data: string }> {
  const frames: Array<{ event: string; data: string }> = [];
  for (const block of chunk.split("\n\n",)) {
    if (!block) { continue; }
    let event = "message";
    let data = "";
    for (const line of block.split("\n",)) {
      if (line.startsWith("event: ",)) { event = line.slice(7,); }
      else if (line.startsWith("data: ",)) { data += line.slice(6,); }
    }
    if (data) { frames.push({ event, data, },); }
  }
  return frames;
}

/**
 * Read frames from an SSE response until `count` frames have been seen or
 * the stream ends. Uses Promise.withResolvers so the read loop has no
 * executor-form callback.
 * @param response
 * @param count
 */
async function readFramesUntil(response: Response, count: number,): Promise<Array<{ event: string; data: string }>> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const { promise: done, resolve: finish, } = Promise.withResolvers<void>();
  const stop = () => {
    finish();
  };
  const pump = (async () => {
    while (true) {
      const { value, done: rd, } = await reader.read();
      if (rd) {
        stop();
        return;
      }
      buf += decoder.decode(value,);
      if (parseFrames(buf,).length >= count) {
        stop();
        return;
      }
    }
  })();
  await done;
  await pump.catch(() => {},);
  await reader.cancel().catch(() => {},);
  return parseFrames(buf,);
}

describe("NotificationStreamer", () => {
  let db: Kysely<DB>;
  const user = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, "alice", "alice-disp",);
  },);

  test("opens an SSE response with the right headers", () => {
    const streamer = new NotificationStreamer(db, user, 60_000,);
    const res = streamer.open();
    expect(res.headers.get("content-type",),).toBe("text/event-stream",);
    expect(res.headers.get("cache-control",),).toBe("no-cache",);
    expect(res.headers.get("connection",),).toBe("keep-alive",);
    expect(res.headers.get("x-accel-buffering",),).toBe("no",);
    res.body?.cancel();
  });

  test("emits an initial notifications event with unreadCount=0 and an empty items list", async () => {
    const streamer = new NotificationStreamer(db, user, 60_000,);
    const res = streamer.open();
    const frames = await readFramesUntil(res, 1,);
    expect(frames[0]?.event,).toBe("notifications",);
    const payload = JSON.parse(frames[0]?.data ?? "{}",);
    expect(payload.unreadCount,).toBe(0,);
    expect(payload.items,).toEqual([],);
  });
  test("loadNotificationSnapshot returns live count + items", async () => {
    const snap = await loadNotificationSnapshot(db, user,);
    expect(snap.count,).toBe(0,);
    expect(snap.recent,).toEqual([],);
  });

  test("loadNotificationSnapshot degrades to defaults when queries fail", async () => {
    const broken = {} as Kysely<DB>;
    const snap = await loadNotificationSnapshot(broken, user,);
    expect(snap.count,).toBe(0,);
    expect(snap.recent,).toEqual([],);
  });
});
