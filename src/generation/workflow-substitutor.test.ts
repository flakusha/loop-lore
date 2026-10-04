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

  it("keeps a whole-string placeholder's original type (Defect 1)", () => {
    // The var type is the point: ComfyUI numeric node inputs are numbers, and
    // a stringified numeric is rejected or silently coerced at submit time.
    expect(substituteWorkflow("{{width}}", { width: 768, },),).toBe(768,);
    expect(substituteWorkflow("{{cfg}}", { cfg: 7.5, },),).toBe(7.5,);
    expect(substituteWorkflow("{{flag}}", { flag: false, },),).toBe(false,);
    expect(substituteWorkflow("{{prompt}}", { prompt: "cat", },),).toBe("cat",);
  });

  it("interpolates to a string when the placeholder is not the whole value", () => {
    // Mixed content has no single type to preserve.
    expect(substituteWorkflow("w={{width}}", { width: 768, },),).toBe("w=768",);
    expect(substituteWorkflow("{{a}}-{{b}}", { a: 1, b: 2, },),).toBe("1-2",);
  });

  it("blanks a whole-string placeholder for an unknown var", () => {
    expect(substituteWorkflow("{{nope}}", { width: 768, },),).toBe("",);
  });

  it("preserves numeric types across a real workflow's node inputs", () => {
    // Regression shape: assert on the *substituted workflow*, not the vars map.
    // The original tests only checked interpolation, which is why a stringified
    // width/seed/steps shipped to ComfyUI unnoticed.
    const wf = {
      "4": { class_type: "EmptyLatentImage", inputs: { width: "{{width}}", height: "{{height}}", }, },
      "5": { class_type: "KSampler", inputs: { seed: "{{seed}}", steps: "{{steps}}", cfg: "{{cfg}}", }, },
      "6": { class_type: "SaveImage", inputs: { filename_prefix: "a-{{seed}}", }, },
    };

    const out = substituteWorkflow(wf, { width: 768, height: 512, seed: 42, steps: 25, cfg: 7, },);

    expect(out["4"].inputs.width,).toBe(768,);
    expect(out["4"].inputs.height,).toBe(512,);
    expect(out["5"].inputs.seed,).toBe(42,);
    expect(out["5"].inputs.steps,).toBe(25,);
    expect(out["5"].inputs.cfg,).toBe(7,);
    // A string template stays a string even though its var is numeric.
    expect(out["6"].inputs.filename_prefix,).toBe("a-42",);
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
