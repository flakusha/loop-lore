import { describe, expect, it, } from "bun:test";
import "./gm-guidance";

/**
 * Pure-logic tests for the GM-guidance Alpine component (`gmGuidance`).
 * `apiFetch`-backed methods (applyGmGuidance) are covered by the route/service
 * tests; these exercise the local state mutations that have no I/O.
 */

const gmGuidance = (globalThis as unknown as Record<string, () => Record<string, unknown>>).gmGuidance!;

describe("gmGuidance state", () => {
  function freshState() {
    const s = gmGuidance() as Record<string, unknown>;
    s._gmGuidance = { constraints: [], turnPriority: {}, };
    s._gmNewConstraint = "";
    return s;
  }

  it("adds a constraint and clears the input", () => {
    const s = freshState();
    s._gmNewConstraint = "stay in character";
    (s.addGmConstraint as () => void).call(s,);
    expect((s._gmGuidance as { constraints: string[] }).constraints,).toContain("stay in character",);
    expect(s._gmNewConstraint,).toBe("",);
  },);

  it("ignores duplicate constraints", () => {
    const s = freshState();
    s._gmGuidance = { constraints: ["x"], turnPriority: {}, };
    s._gmNewConstraint = "x";
    (s.addGmConstraint as () => void).call(s,);
    const count = (s._gmGuidance as { constraints: string[] }).constraints.filter((c,) => c === "x",).length;
    expect(count,).toBe(1,);
  },);

  it("ignores blank constraints", () => {
    const s = freshState();
    s._gmNewConstraint = "   ";
    (s.addGmConstraint as () => void).call(s,);
    expect((s._gmGuidance as { constraints: string[] }).constraints.length,).toBe(0,);
  },);

  it("removes a constraint", () => {
    const s = freshState();
    s._gmGuidance = { constraints: ["a", "b"], turnPriority: {}, };
    (s.removeGmConstraint as (c: string,) => void).call(s, "a",);
    expect((s._gmGuidance as { constraints: string[] }).constraints,).toEqual(["b"],);
  },);

  it("sets per-participant turn priority", () => {
    const s = freshState();
    (s.setGmTurnPriority as (id: string, l: string,) => void).call(s, "actor-1", "high",);
    expect((s._gmGuidance as { turnPriority: Record<string, string> }).turnPriority["actor-1"],).toBe("high",);
  },);

  it("clearGmGuidance resets local state (apply is I/O)", async () => {
    const s = freshState();
    s._gmGuidance = { constraints: ["a"], turnPriority: { "actor-1": "high", }, };
    let applied = false;
    (s as { applyGmGuidance?: () => Promise<void> }).applyGmGuidance = async () => {
      applied = true;
    };
    await (s.clearGmGuidance as () => Promise<void>).call(s,);
    expect((s._gmGuidance as { constraints: string[] }).constraints.length,).toBe(0,);
    expect((s._gmGuidance as { turnPriority: Record<string, string> }).turnPriority,).toEqual({},);
    expect(applied,).toBe(true,);
  },);
},);
