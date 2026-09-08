import { afterEach, describe, expect, mock, test, } from "bun:test";
import { useRequestStatus, } from "./use-request-status";

// ── Mock ../fe-fetch (must precede importing ./use-request-status) ──
type FeFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let seenUrls: string[] = [];
let handler: FeFetchMock = async () => Response.json({ requestId: "r1", status: "complete", },);

mock.module("../fe-fetch", () => ({
  feFetch: (async (url: string, opts?: RequestInit,) => {
    seenUrls.push(url,);
    return handler(url, opts,);
  }) satisfies FeFetchMock,
}),);

afterEach(() => {
  seenUrls = [];
  handler = async () => Response.json({ requestId: "r1", status: "complete", },);
},);

interface Recorder {
  updates: string[];
  terminals: string[];
}

function record(): Recorder {
  const rec: Recorder = { updates: [], terminals: [], };
  return rec;
}

describe("useRequestStatus", () => {
  test("polls the status endpoint and terminates on complete", async () => {
    const rec = record();
    const { subscribe, cancel, } = useRequestStatus({
      onUpdate: (p,) => rec.updates.push(p.status,),
      onTerminal: (p,) => rec.terminals.push(p.status,),
    },);
    subscribe("r1",);
    await new Promise<void>((resolve,) => setTimeout(resolve, 0,)); // let the first poll settle
    expect(seenUrls,).toEqual(["/api/v1/requests/r1/status",],);
    expect(rec.updates,).toEqual(["complete",],);
    expect(rec.terminals,).toEqual(["complete",],);
    cancel();
  });

  test("reports failure when the endpoint returns non-ok", async () => {
    const rec = record();
    handler = async () => new Response("", { status: 500, },);
    const { subscribe, cancel, } = useRequestStatus({
      onUpdate: (p,) => rec.updates.push(p.error ?? "",),
      onTerminal: (p,) => rec.terminals.push(p.status,),
    },);
    subscribe("r1",);
    await new Promise<void>((resolve,) => setTimeout(resolve, 0,));
    expect(rec.updates[0],).toContain("500",);
    expect(rec.terminals,).toEqual(["failed",],);
    cancel();
  });

  test("reports failure when fetch rejects", async () => {
    const rec = record();
    handler = async () => {
      throw new Error("offline",);
    };
    const { subscribe, cancel, } = useRequestStatus({
      onUpdate: (p,) => rec.updates.push(p.error ?? "",),
      onTerminal: (p,) => rec.terminals.push(p.status,),
    },);
    subscribe("r1",);
    await new Promise<void>((resolve,) => setTimeout(resolve, 0,));
    expect(rec.updates,).toEqual(["offline",],);
    expect(rec.terminals,).toEqual(["failed",],);
    cancel();
  });

  test("stops at the duration ceiling with a non-terminal payload", async () => {
    const rec = record();
    handler = async () => Response.json({ requestId: "r1", status: "in_progress", },);
    const { subscribe, cancel, } = useRequestStatus({
      maxDurationMs: 0,
      onTerminal: (p,) => rec.terminals.push(p.status,),
    },);
    subscribe("r1",);
    await new Promise<void>((resolve,) => setTimeout(resolve, 0,));
    expect(seenUrls,).toHaveLength(1,);
    expect(rec.terminals,).toEqual(["in_progress",],);
    cancel();
  });

  test("cancel aborts a pending poll before it reports again", async () => {
    const rec = record();
    const gate = Promise.withResolvers<void>();
    let fetchCount = 0;
    handler = async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return Response.json({ requestId: "r1", status: "in_progress", },);
      }
      await gate.promise;
      return Response.json({ requestId: "r1", status: "complete", },);
    };
    const { subscribe, cancel, } = useRequestStatus({
      intervalMs: 1,
      onUpdate: (p,) => rec.updates.push(p.status,),
      onTerminal: (p,) => rec.terminals.push(p.status,),
    },);
    subscribe("r1",);
    await new Promise<void>((resolve,) => setTimeout(resolve, 0,)); // first poll done, timer pending
    expect(rec.updates,).toEqual(["in_progress",],);
    cancel();
    gate.resolve();
    // Drain the already-scheduled timer callback: a single zero-delay macro
    // task is the deterministic, zero-latency way to let it run or die.
    await new Promise<void>((resolve,) => setTimeout(resolve, 0,));
    expect(rec.updates,).toEqual(["in_progress",],);
    expect(rec.terminals,).toEqual([],);
  });
});

describe("useRequestStatus — odd failure payloads", () => {
  test("stringifies a non-Error rejection into the error channel", async () => {
    const rec: { updates: string[]; terminals: string[] } = { updates: [], terminals: [], };
    handler = async () => {
      throw "boom-str";
    };
    const { subscribe, cancel, } = useRequestStatus({
      onUpdate: (p,) => rec.updates.push(p.error ?? "",),
      onTerminal: (p,) => rec.terminals.push(p.status,),
    },);
    subscribe("r1",);
    await new Promise<void>((resolve,) => setTimeout(resolve, 0,));
    expect(rec.updates,).toEqual(["boom-str",],);
    expect(rec.terminals,).toEqual(["failed",],);
    cancel();
  });
});
