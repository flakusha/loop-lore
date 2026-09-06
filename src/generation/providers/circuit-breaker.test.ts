/**
 * Circuit Breaker Tests
 *
 * Pins closed/open/half-open transitions with a stubbed clock.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { CircuitBreaker, } from "./circuit-breaker.js";

const realNow = Date.now;
let now = 1_000_000;
afterEach(() => {
  Date.now = realNow;
  now = 1_000_000;
},);

function breaker(): CircuitBreaker {
  Date.now = () => now;
  const cb = new CircuitBreaker();
  cb.register("p", { threshold: 2, baseCooldownMs: 50, maxCooldownMs: 1_000, },);
  return cb;
}

describe("CircuitBreaker", () => {
  it("allows requests while closed", () => {
    const cb = breaker();
    expect(cb.allowRequest("p",),).toBe(true,);
    cb.onFailure("p",);
    expect(cb.allowRequest("p",),).toBe(true,);
  });
  it("opens after threshold failures and blocks", () => {
    const cb = breaker();
    cb.onFailure("p",);
    cb.onFailure("p",);
    expect(cb.getState("p",)?.state,).toBe("open",);
    expect(cb.allowRequest("p",),).toBe(false,);
  });
  it("half-opens after cooldown and closes on probe success", () => {
    const cb = breaker();
    cb.onFailure("p",);
    cb.onFailure("p",);
    now += 10_000;
    expect(cb.allowRequest("p",),).toBe(true,);
    expect(cb.getState("p",)?.state,).toBe("half-open",);
    cb.onSuccess("p",);
    expect(cb.getState("p",)?.state,).toBe("closed",);
    expect(cb.allowRequest("p",),).toBe(true,);
  });
  it("resets to closed on demand", () => {
    const cb = breaker();
    cb.onFailure("p",);
    cb.onFailure("p",);
    cb.reset("p",);
    expect(cb.getState("p",)?.state,).toBe("closed",);
    expect(cb.allowRequest("p",),).toBe(true,);
  });
});
