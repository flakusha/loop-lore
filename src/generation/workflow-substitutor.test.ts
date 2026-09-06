/**
 * Workflow Substitutor Tests
 *
 * Pins placeholder replacement, node overrides, and var defaults.
 */
import { describe, expect, it, } from "bun:test";
import {
  applyNodeOverrides,
  buildSubstitutionVars,
  substituteWorkflow,
} from "./workflow-substitutor.js";

describe("substituteWorkflow", () => {
  it("interpolates known vars and blanks unknown ones", () => {
    expect(substituteWorkflow("a {{prompt}} b", { prompt: "cat", },),).toBe("a cat b",);
    expect(substituteWorkflow("a {{nope}} b", { prompt: "cat", },),).toBe("a  b",);
  });
  it("replaces through nested objects and arrays", () => {
    const out = substituteWorkflow({ n: { text: "{{prompt}}", deep: ["{{x}}", 5,], }, }, { prompt: "hi", x: "y", },);
    expect(out,).toEqual({ n: { text: "hi", deep: ["y", 5,], }, },);
  });
  it("passes numbers, booleans, and null through", () => {
    expect(substituteWorkflow(7, {},),).toBe(7,);
    expect(substituteWorkflow(null, {},),).toBeNull();
  });
});

describe("applyNodeOverrides", () => {
  const workflow = { "5": { class_type: "CLIPTextEncode", inputs: { text: "old", cfg: 1, }, }, };
  it("returns a new top-level workflow with merged inputs", () => {
    const out = applyNodeOverrides(workflow, new Map([["5", { text: "new", },],],),);
    expect(out,).not.toBe(workflow,);
    expect(out["5"]?.inputs,).toEqual({ text: "new", cfg: 1, },);
  });
  it("ignores unknown nodes and empty override maps", () => {
    expect(applyNodeOverrides(workflow, new Map(),),).toBe(workflow,);
    expect(applyNodeOverrides(workflow, new Map([["9", { text: "x", },],],),)["5"],).toBe(workflow["5"],);
  });
});

describe("buildSubstitutionVars", () => {
  it("maps generation params with defaults", () => {
    const vars = buildSubstitutionVars({ prompt: "cat", },);
    expect(vars.prompt,).toBe("cat",);
    expect(vars.width,).toBe(512,);
    expect(vars.steps,).toBe(20,);
    expect(vars.sampler,).toBe("euler",);
  });
  it("passes explicit values and extras through", () => {
    const vars = buildSubstitutionVars({ prompt: "cat", width: 768, seed: 42, model: "m", },);
    expect(vars.width,).toBe(768,);
    expect(vars.seed,).toBe(42,);
    expect(vars.model,).toBe("m",);
  });
});
