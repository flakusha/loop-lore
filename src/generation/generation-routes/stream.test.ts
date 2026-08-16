/**
 * Tests for the HTMX SSE generation-stream endpoint
 * (`handleGenerationStream`): replay on reconnect, live subscription,
 * done/error signalling, and keepalive headers.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { getOrCreateBuffer, removeBuffer, } from "../stream-buffer";
import { handleGenerationStream, } from "./stream";

const seenChatIds: string[] = [];

afterEach(() => {
  for (const id of seenChatIds) { removeBuffer(id,); }
},);

function chatId(): string {
  const id = `stream-test-${crypto.randomUUID()}`;
  seenChatIds.push(id,);
  return id;
}

async function readAll(response: Response,): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) { return ""; }
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value, } = await reader.read();
    if (done) { break; }
    out += decoder.decode(value, { stream: true, },);
  }
  out += decoder.decode();
  return out;
}

const sleep = (ms: number,) => new Promise((resolve,) => setTimeout(resolve, ms,));

describe("handleGenerationStream", () => {
  test("returns 400 when chatId is missing", async () => {
    const res = handleGenerationStream("",);
    expect(res.status,).toBe(400,);
    expect(await res.json(),).toMatchObject({ error: "chatId is required", },);
  });

  test("sets SSE response headers", () => {
    const res = handleGenerationStream(chatId(),);
    expect(res.headers.get("Content-Type",),).toBe("text/event-stream",);
    expect(res.headers.get("Cache-Control",),).toBe("no-cache",);
    expect(res.headers.get("Connection",),).toBe("keep-alive",);
    expect(res.headers.get("X-Accel-Buffering",),).toBe("no",);
  });

  test("replays buffered events and closes when the buffer is done", async () => {
    const id = chatId();
    const buf = getOrCreateBuffer(id,);
    buf.append("stream-update", "<p>one</p>",);
    buf.append("stream-update", "<p>two</p>",);
    buf.signalDone();

    const res = handleGenerationStream(id,);
    const body = await readAll(res,);
    expect(body,).toContain("event: stream-update\n",);
    expect(body,).toContain("data: <p>one</p>",);
    expect(body,).toContain("data: <p>two</p>",);
  });

  test("replays only events after the Last-Event-ID sequence", async () => {
    const id = chatId();
    const buf = getOrCreateBuffer(id,);
    buf.append("stream-update", "a",);
    buf.append("stream-update", "b",);
    buf.append("stream-update", "c",);
    buf.signalDone();

    const headers = new Headers({ "Last-Event-ID": "1", },);
    const body = await readAll(handleGenerationStream(id, headers,),);
    expect(body,).not.toContain("data: a",);
    expect(body,).toContain("data: b",);
    expect(body,).toContain("data: c",);
  });

  test("prefixes every line of multi-line html with data:", async () => {
    const id = chatId();
    getOrCreateBuffer(id,).append("stream-update", "line1\nline2",);
    getOrCreateBuffer(id,).signalDone();

    const body = await readAll(handleGenerationStream(id,),);
    expect(body,).toContain("data: line1\ndata: line2",);
  });

  test("emits stream-error and closes when no active generation exists", async () => {
    const res = handleGenerationStream(chatId(),);
    const body = await readAll(res,);
    expect(body,).toContain("event: stream-error",);
    expect(body,).toContain("data: No active generation",);
  }, 20_000,);

  test("streams live events and a done event on completion", async () => {
    const id = chatId();
    const buf = getOrCreateBuffer(id,);

    const chunks: string[] = [];
    const consume = (async () => {
      const reader = (handleGenerationStream(id,)).body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value, } = await reader.read();
        if (done) { break; }
        chunks.push(decoder.decode(value, { stream: true, },),);
      }
      chunks.push(decoder.decode(),);
    })();

    // Let the stream subscribe to the buffer, then push a live event.
    await sleep(50,);
    buf.append("stream-update", "<p>live</p>",);
    buf.signalDone();

    await consume;
    const body = chunks.join("",);
    expect(body,).toContain("event: stream-update",);
    expect(body,).toContain("data: <p>live</p>",);
    expect(body,).toContain("event: stream-done\ndata: {}",);
  });

  test("streams a stream-error event when the buffer signals an error", async () => {
    const id = chatId();
    const buf = getOrCreateBuffer(id,);

    const chunks: string[] = [];
    const consume = (async () => {
      const reader = (handleGenerationStream(id,)).body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value, } = await reader.read();
        if (done) { break; }
        chunks.push(decoder.decode(value, { stream: true, },),);
      }
      chunks.push(decoder.decode(),);
    })();

    await sleep(50,);
    buf.signalError("provider blew up",);

    await consume;
    const body = chunks.join("",);
    expect(body,).toContain("event: stream-error",);
    expect(body,).toContain('data: {"error":"provider blew up"}',);
  });

  test("closes immediately when the buffer already errored before connect", async () => {
    const id = chatId();
    getOrCreateBuffer(id,).signalError("pre-failed",);

    const body = await readAll(handleGenerationStream(id,),);
    expect(body,).toBe("",);
  });
});
