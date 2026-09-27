// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for the shared provider retry policy: attempt count, the retryability
// rule, and the abort/timeout classification all three providers now share.
import { describe, expect, test, } from "bun:test";
import { withProviderRetry, } from "./retry";
import { ProviderError, } from "./types";

describe("withProviderRetry", () => {
  test("resolves the thunk result on the first success", async () => {
    let calls = 0;
    const result = await withProviderRetry(() => {
      calls++;
      return Promise.resolve("ok",);
    }, 3,);
    expect(result,).toBe("ok",);
    expect(calls,).toBe(1,);
  });

  test("retries a retryable failure and succeeds on a later attempt", async () => {
    let calls = 0;
    const result = await withProviderRetry(() => {
      calls++;
      return calls === 1
        ? Promise.reject(new ProviderError("upstream 500", undefined, 500, true,),)
        : Promise.resolve("recovered",);
    }, 2,);
    expect(result,).toBe("recovered",);
    expect(calls,).toBe(2,);
  });

  test("stops immediately on a non-retryable ProviderError", async () => {
    let calls = 0;
    await withProviderRetry(() => {
      calls++;
      return Promise.reject(new ProviderError("bad request", undefined, 400, false,),);
    }, 3,).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect(error,).toBeInstanceOf(ProviderError,);
        expect((error as ProviderError).statusCode,).toBe(400,);
      },
    );
    expect(calls,).toBe(1,);
  });

  test("exhausts the retry budget and rethrows the last failure", async () => {
    let calls = 0;
    await withProviderRetry(() => {
      calls++;
      return Promise.reject(new ProviderError(`attempt ${calls}`, undefined, 500, true,),);
    }, 0,).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as Error).message,).toBe("attempt 1",);
      },
    );
    expect(calls,).toBe(1,);
  });

  test("retries a transport error that is not a ProviderError", async () => {
    let calls = 0;
    const result = await withProviderRetry(() => {
      calls++;
      return calls === 1 ? Promise.reject(new TypeError("network down",),) : Promise.resolve(7,);
    }, 1,);
    expect(result,).toBe(7,);
    expect(calls,).toBe(2,);
  });

  test("classifies an aborted signal as a non-retryable cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await withProviderRetry(
      () => {
        calls++;
        return Promise.reject(new TypeError("network down",),);
      },
      3,
      controller.signal,
    ).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect(error,).toBeInstanceOf(ProviderError,);
        expect((error as ProviderError).message,).toBe("Request cancelled",);
        expect((error as ProviderError).retryable,).toBe(false,);
      },
    );
    expect(calls,).toBe(1,);
  });

  test("surfaces a non-retryable ProviderError even when the signal is aborted", async () => {
    // Precedence: an auth failure stays an auth failure. callWithFailover
    // maps ProviderError subclasses and cancellations down different paths,
    // so reclassifying a 401 as "Request cancelled" would swallow it.
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await withProviderRetry(
      () => {
        calls++;
        return Promise.reject(new ProviderError("API key invalid", undefined, 401, false,),);
      },
      3,
      controller.signal,
    ).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect(error,).toBeInstanceOf(ProviderError,);
        expect((error as ProviderError).message,).toBe("API key invalid",);
        expect((error as ProviderError).statusCode,).toBe(401,);
      },
    );
    expect(calls,).toBe(1,);
  });

  test("waits 1s then 2s across three attempts, then rethrows the last failure", async () => {
    // Real clock on purpose: the delay sequence is part of the contract the
    // three hand-rolled loops used to guarantee, so it is measured, not mocked.
    const stamps: number[] = [];
    const at = (index: number,): number => stamps[index] ?? 0;
    await withProviderRetry(() => {
      stamps.push(Date.now(),);
      return Promise.reject(new Error(`attempt ${stamps.length}`,),);
    }, 2,).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as Error).message,).toBe("attempt 3",);
      },
    );
    expect(stamps.length,).toBe(3,);
    expect(at(1,) - at(0,),).toBeGreaterThan(900,);
    expect(at(1,) - at(0,),).toBeLessThan(1_400,);
    expect(at(2,) - at(1,),).toBeGreaterThan(1_800,);
    expect(at(2,) - at(1,),).toBeLessThan(2_400,);
  }, 20_000,);

  test("classifies a fetch AbortError as a non-retryable 504 timeout", async () => {
    await withProviderRetry(() => Promise.reject(new DOMException("Aborted", "AbortError",),), 3,).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect(error,).toBeInstanceOf(ProviderError,);
        expect((error as ProviderError).message,).toBe("Request timed out",);
        expect((error as ProviderError).statusCode,).toBe(504,);
        expect((error as ProviderError).retryable,).toBe(false,);
      },
    );
  });
});
