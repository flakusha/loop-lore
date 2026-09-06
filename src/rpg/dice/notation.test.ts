import { describe, expect, it, } from "bun:test";
import { parseDiceNotation, } from "./notation";

describe("rpg/dice/notation (0% -> real logic)", () => {
  it('parses "2d6+3" correctly', () => {
    const p = parseDiceNotation("2d6+3",);
    expect(p,).not.toBeNull();
    expect(p!.count,).toBe(2,);
    expect(p!.sides,).toBe(6,);
    expect(p!.modifier,).toBe(3,);
  });
  it('parses "d20 adv" correctly', () => {
    const p = parseDiceNotation("d20 adv",);
    expect(p,).not.toBeNull();
    expect(p!.count,).toBe(1,);
    expect(p!.sides,).toBe(20,);
    // source maps 'adv' to full string 'advantage'
    expect(p!.advantage,).toBe("advantage",);
  });
  it("rejects invalid notation", () => {
    expect(parseDiceNotation("bad",),).toBeNull();
    expect(parseDiceNotation("3d99",),).toBeNull();
  });
});
