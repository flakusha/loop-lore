/**
 * Notifications — SSE streamer. Pushes notification updates over SSE;
 * recomputes the unread snapshot on an interval and emits the recent list only
 * when it changes, keeping the wire quiet while remaining authoritative. A
 * dropped connection is repaired by the client's next poll.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { NotificationService, } from "../../notifications/service";
import { safeJsonStringify, } from "../../utils";

export const POLL_INTERVAL_MS = 5000;
export const KEEPALIVE_MS = 15_000;

export class NotificationStreamer {
  constructor(
    private readonly database: Kysely<DB>,
    private readonly userId: string,
    private readonly intervalMs: number = POLL_INTERVAL_MS,
  ) {}

  open(): Response {
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setInterval> | undefined;
    let keepalive: ReturnType<typeof setInterval> | undefined;
    let lastSnapshot = "";

    const send = (controller: ReadableStreamDefaultController, event: string, data: unknown,) => {
      try {
        const payload = safeJsonStringify(data,);
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload.ok ? payload.value : "{}"}\n\n`,),);
      } catch {
        // controller closed — ignore
      }
    };

    const tick = async (controller: ReadableStreamDefaultController,): Promise<void> => {
      try {
        const service = new NotificationService(this.database,);
        const [countRes, recentRes,] = await Promise.allSettled([
          service.getUnreadCount(this.userId,),
          service.list(this.userId, false,),
        ],);
        const count = countRes.status === "fulfilled" ? countRes.value : 0;
        const recent = recentRes.status === "fulfilled" ? recentRes.value : [];
        const snap = `${count}:${recent[0]?.id ?? ""}`;
        if (snap !== lastSnapshot) {
          lastSnapshot = snap;
          send(controller, "notifications", { unreadCount: count, items: recent.slice(0, 10,), },);
        }
      } catch {
        // transient DB error — skip this tick, keep stream alive
      }
    };

    const stream = new ReadableStream({
      start: async (controller,) => {
        try {
          const service = new NotificationService(this.database,);
          const [countRes, recentRes,] = await Promise.allSettled([
            service.getUnreadCount(this.userId,),
            service.list(this.userId, false,),
          ],);
          const count = countRes.status === "fulfilled" ? countRes.value : 0;
          const recent = recentRes.status === "fulfilled" ? recentRes.value : [];
          lastSnapshot = `${count}:${recent[0]?.id ?? ""}`;
          send(controller, "notifications", { unreadCount: count, items: recent.slice(0, 10,), },);
        } catch (error) {
          send(controller, "stream-error", { error: String(error,), },);
        }

        timer = setInterval(() => {
          void tick(controller,);
        }, this.intervalMs,);

        keepalive = setInterval(() => send(controller, "ping", { t: Date.now(), },), KEEPALIVE_MS,);
      },
      cancel: () => {
        if (timer) { clearInterval(timer,); }
        if (keepalive) { clearInterval(keepalive,); }
      },
    },);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    },);
  }
}
