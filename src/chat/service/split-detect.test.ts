import { describe, expect, test, } from "bun:test";
import { detectReuniteIntent, detectSplitIntent, } from "./split";

describe("detectSplitIntent", () => {
  test("detects split narration", () => {
    expect(detectSplitIntent("we split up",),).toBe(true,);
    expect(detectSplitIntent("I'll go left, you go right",),).toBe(true,);
    expect(detectSplitIntent("hello",),).toBe(false,);
  });
});

describe("detectReuniteIntent", () => {
  test("detects reunite narration", () => {
    expect(detectReuniteIntent("we meet back",),).toBe(true,);
    expect(detectReuniteIntent("the group reunites",),).toBe(true,);
    expect(detectReuniteIntent("hello",),).toBe(false,);
  });
});
