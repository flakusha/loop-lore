import { describe, expect, test, } from "bun:test";
import { getBuffer, getOrCreateBuffer, removeBuffer, scheduleBufferCleanup, StreamBuffer, } from "./stream-buffer";

describe("StreamBuffer", () => {
  test("append assigns incrementing sequence and stores event", () => {
    const buf = new StreamBuffer();
    const seq = buf.append("stream-update", "<p>hi</p>",);
    expect(seq,).toBe(0,);
    expect(buf.currentSequence,).toBe(1,);
    expect(buf.isEmpty,).toBe(false,);
    expect(buf.replay(),).toEqual([{ type: "stream-update", html: "<p>hi</p>", sequence: 0, },],);
  });

  test("notifies live subscribers on append", () => {
    const buf = new StreamBuffer();
    const seen: string[] = [];
    const unsub = buf.subscribe((e,) => {
      seen.push(e.html,);
    },);
    buf.append("stream-update", "a",);
    buf.append("stream-done", "{}",);
    expect(seen,).toEqual(["a", "{}",],);
    unsub();
    buf.append("stream-update", "b",);
    expect(seen,).toEqual(["a", "{}",],);
  });

  test("trims oldest when over MAX_EVENTS (count)", () => {
    const buf = new StreamBuffer();
    for (let i = 0; i < 501; i++) {
      buf.append("stream-update", `e${i}`,);
    }
    expect(buf.replay().length,).toBe(500,);
    // Oldest (sequence 0) was evicted
    expect(buf.replay(0,)[0]?.sequence,).toBe(1,);
  });

  test("trims oldest when over MAX_BYTES", () => {
    const buf = new StreamBuffer();
    const huge = "x".repeat(1_200_000,); // > 1 MB
    buf.append("stream-update", huge,);
    // Single oversized event is evicted immediately
    expect(buf.isEmpty,).toBe(true,);
  });

  test("replay filters by fromSequence", () => {
    const buf = new StreamBuffer();
    buf.append("a", "1",);
    buf.append("b", "2",);
    buf.append("c", "3",);
    expect(buf.replay(1,).map((e,) => e.html),).toEqual(["2", "3",],);
  });

  test("signalDone marks done and notifies", () => {
    const buf = new StreamBuffer();
    let done = false;
    let live = false;
    buf.subscribe(
      () => void 0,
      () => (done = true),
      () => (live = true),
    );
    buf.signalDone();
    expect(buf.isDone,).toBe(true,);
    expect(done,).toBe(true,);
    expect(live,).toBe(false,);
  });

  test("signalError records error and notifies", () => {
    const buf = new StreamBuffer();
    let err = "";
    buf.subscribe(
      () => void 0,
      () => void 0,
      (e,) => (err = e),
    );
    buf.signalError("boom",);
    expect(buf.hasError,).toBe("boom",);
    expect(err,).toBe("boom",);
  });
});

describe("global stream buffer store", () => {
  test("getOrCreateBuffer returns a stable instance", () => {
    const a = getOrCreateBuffer("chat-x",);
    const b = getOrCreateBuffer("chat-x",);
    expect(a,).toBe(b,);
    a.append("stream-update", "z",);
    expect(b.replay()[0]?.html,).toBe("z",);
    removeBuffer("chat-x",);
  });

  test("getBuffer is undefined before creation", () => {
    expect(getBuffer("never-made",),).toBeUndefined();
  });

  test("removeBuffer drops the chat", () => {
    getOrCreateBuffer("chat-y",).append("stream-update", "q",);
    removeBuffer("chat-y",);
    expect(getBuffer("chat-y",),).toBeUndefined();
  });

  test("scheduleBufferCleanup does not throw", () => {
    getOrCreateBuffer("chat-z",);
    expect(() => scheduleBufferCleanup("chat-z",)).not.toThrow();
    removeBuffer("chat-z",);
  });
});
