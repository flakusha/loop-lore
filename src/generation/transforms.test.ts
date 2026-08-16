import { describe, expect, it, } from "bun:test";
import type { RegexTransform, } from "../config/schema";
import { applyRegexTransforms, } from "./transforms";

describe("applyRegexTransforms", () => {
  it("applies basic pattern replacement", () => {
    const transforms: RegexTransform[] = [
      { name: "fix spaces", pattern: "\\s+", replacement: " ", enabled: true, },
    ];
    const result = applyRegexTransforms("hello   world", transforms,);
    expect(result.text,).toBe("hello world",);
    expect(result.applied,).toHaveLength(1,);
    expect(result.applied[0]!.matches,).toBe(1,);
  });

  it("skips disabled transforms", () => {
    const transforms: RegexTransform[] = [
      { name: "disabled", pattern: "a", replacement: "b", enabled: false, },
    ];
    const result = applyRegexTransforms("aaa", transforms,);
    expect(result.text,).toBe("aaa",);
    expect(result.applied,).toHaveLength(0,);
  });

  it("handles invalid regex gracefully", () => {
    const transforms: RegexTransform[] = [
      { name: "bad regex", pattern: "[invalid", replacement: "x", enabled: true, },
    ];
    const result = applyRegexTransforms("hello", transforms,);
    expect(result.text,).toBe("hello",);
    expect(result.applied,).toHaveLength(0,);
  });

  it("applies multiple transforms in order", () => {
    const transforms: RegexTransform[] = [
      { name: "step1", pattern: "foo", replacement: "bar", enabled: true, },
      { name: "step2", pattern: "bar", replacement: "baz", enabled: true, },
    ];
    const result = applyRegexTransforms("foo foo", transforms,);
    expect(result.text,).toBe("baz baz",);
    expect(result.applied,).toHaveLength(2,);
    expect(result.applied[0]!.name,).toBe("step1",);
    expect(result.applied[1]!.name,).toBe("step2",);
  });

  it("tracks match counts per transform", () => {
    const transforms: RegexTransform[] = [
      { name: "count", pattern: "\\d+", replacement: "NUM", enabled: true, },
    ];
    const result = applyRegexTransforms("123 abc 456 def 789", transforms,);
    expect(result.text,).toBe("NUM abc NUM def NUM",);
    expect(result.applied[0]!.matches,).toBe(3,);
  });

  it("returns original text when no transforms match", () => {
    const transforms: RegexTransform[] = [
      { name: "no match", pattern: "xyz", replacement: "abc", enabled: true, },
    ];
    const result = applyRegexTransforms("hello world", transforms,);
    expect(result.text,).toBe("hello world",);
    expect(result.applied,).toHaveLength(0,);
  });

  it("respects custom flags", () => {
    const transforms: RegexTransform[] = [
      { name: "case insensitive", pattern: "hello", replacement: "HI", flags: "gi", enabled: true, },
    ];
    const result = applyRegexTransforms("Hello HELLO hello", transforms,);
    expect(result.text,).toBe("HI HI HI",);
    expect(result.applied[0]!.matches,).toBe(3,);
  });

  it("handles capture groups in replacement", () => {
    const transforms: RegexTransform[] = [
      { name: "swap", pattern: "(\\w+) (\\w+)", replacement: "$2 $1", enabled: true, },
    ];
    const result = applyRegexTransforms("hello world", transforms,);
    expect(result.text,).toBe("world hello",);
  });

  it("applies only enabled transforms from a mixed list", () => {
    const transforms: RegexTransform[] = [
      { name: "on", pattern: "a", replacement: "b", enabled: true, },
      { name: "off", pattern: "b", replacement: "c", enabled: false, },
      { name: "on2", pattern: "d", replacement: "e", enabled: true, },
    ];
    const result = applyRegexTransforms("a d", transforms,);
    expect(result.text,).toBe("b e",);
    expect(result.applied,).toHaveLength(2,);
    expect(result.applied[0]!.name,).toBe("on",);
    expect(result.applied[1]!.name,).toBe("on2",);
  });

  it("handles empty input", () => {
    const transforms: RegexTransform[] = [
      { name: "anything", pattern: ".", replacement: "x", enabled: true, },
    ];
    const result = applyRegexTransforms("", transforms,);
    expect(result.text,).toBe("",);
    expect(result.applied,).toHaveLength(0,);
  });

  it("returns empty applied array for empty transforms list", () => {
    const result = applyRegexTransforms("hello", [],);
    expect(result.text,).toBe("hello",);
    expect(result.applied,).toHaveLength(0,);
  });

  it("runs transforms phase-grouped in canonical order regardless of list position", () => {
    const transforms: RegexTransform[] = [
      { name: "early-display", pattern: "C", replacement: "D", enabled: true, phase: "display", },
      { name: "late-output", pattern: "b", replacement: "C", enabled: true, phase: "output", },
      { name: "first-edit-input", pattern: "a", replacement: "b", enabled: true, phase: "edit-input", },
    ];
    // Canonical order edit-input → output → display ⇒ a→b (edit-input), b→C (output), C→D (display)
    const result = applyRegexTransforms("a", transforms,);
    expect(result.text,).toBe("D",);
    expect(result.applied.map((a,) => a.name),).toEqual([
      "first-edit-input",
      "late-output",
      "early-display",
    ],);
  });

  it("preserves list order within the same phase", () => {
    const transforms: RegexTransform[] = [
      { name: "step1", pattern: "foo", replacement: "bar", enabled: true, phase: "output", },
      { name: "step2", pattern: "bar", replacement: "baz", enabled: true, phase: "output", },
    ];
    const result = applyRegexTransforms("foo foo", transforms,);
    expect(result.text,).toBe("baz baz",);
    expect(result.applied.map((a,) => a.name),).toEqual(["step1", "step2",],);
  });

  it("defaults missing phase to output (runs after edit-input, before display)", () => {
    const transforms: RegexTransform[] = [
      { name: "default-output", pattern: "b", replacement: "c", enabled: true, },
      { name: "edit-phase", pattern: "a", replacement: "b", enabled: true, phase: "edit-input", },
      { name: "display-phase", pattern: "c", replacement: "D", enabled: true, phase: "display", },
    ];
    // edit-input a→b, then default-output (output slot) b→c, then display c→D
    const result = applyRegexTransforms("a", transforms,);
    expect(result.text,).toBe("D",);
    expect(result.applied.map((a,) => a.name),).toEqual([
      "edit-phase",
      "default-output",
      "display-phase",
    ],);
  });
});
