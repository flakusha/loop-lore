import { afterEach, beforeEach, describe, expect, it, vi, } from "bun:test";
import { installBattleDom, } from "../tests/battle-fake-dom";
import { animateDiceRoll, animateSkillCheck, } from "./skill-check";

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
  vi.useFakeTimers();
},);

afterEach(() => {
  vi.useRealTimers();
  restoreDom();
},);

describe("animateDiceRoll", () => {
  it("lands on the final roll and clears the rolling flag", async () => {
    const dice = document.createElement("span",) as unknown as HTMLElement;
    const { promise, resolve, } = Promise.withResolvers<number>();
    animateDiceRoll(dice, 17, { frames: 2, intervalMs: 10, onComplete: resolve, },);
    const pending = promise.then((roll,) => {
      expect(dice.textContent,).toBe("17",);

      return roll;
    },);

    vi.advanceTimersByTime(30,);

    expect(await pending,).toBe(17,);
    expect(animateSkillCheck,).toBe(animateDiceRoll,);
  });

  it("lands on the final roll at once when motion is reduced", () => {
    const host = globalThis as { matchMedia?: (query: string,) => { matches: boolean } };
    const original = host.matchMedia;
    host.matchMedia = () => ({ matches: true, });

    try {
      const dice = document.createElement("span",) as unknown as HTMLElement;
      animateDiceRoll(dice, 17, { frames: 2, intervalMs: 10, },);
      expect(dice.textContent,).toBe("17",);
      expect(dice.classList.contains("battle-dice-rolling",),).toBe(false,);
    } finally {
      if (original) {
        host.matchMedia = original;
      } else {
        delete host.matchMedia;
      }
    }
  });

  it("completes the roll when there is no dice element", async () => {
    const { promise, resolve, } = Promise.withResolvers<number>();
    animateDiceRoll(null, 17, { onComplete: resolve, },);

    expect(await promise,).toBe(17,);
  });
});
