// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trust-boundary tests for the single run-parameter validation pass: declared
 * ranges/steps/selects plus the two discovered ComfyUI sampling axes.
 */
import { describe, expect, it, } from "bun:test";
import { missingRequiredParams, } from "../validation/schemas";
import { txt2img, } from "./templates/builtin/txt2img";
import type { TemplateParameter, } from "./types";
import { validateRunParams, } from "./validate-run-params";

const template = (parameters: TemplateParameter[],) => ({ parameters, });

describe("required parameters", () => {
  it("accepts 0 and false but rejects null/undefined", () => {
    const spec = template([
      { name: "steps", type: "number", label: "Steps", default: 0, required: true, },
      { name: "enabled", type: "boolean", label: "Enabled", default: false, required: true, },
    ],);

    expect(missingRequiredParams(spec, { steps: 0, enabled: false, },),).toEqual([],);
    expect(missingRequiredParams(spec, { steps: null, enabled: false, },),).toEqual(["steps",],);
    expect(missingRequiredParams(spec, { steps: 0, },),).toEqual(["enabled",],);
    expect(validateRunParams({ template: spec, params: { steps: 0, enabled: false, }, },),).toEqual([],);
  });
});

describe("declared ranges", () => {
  const spec = template([
    { name: "scale", type: "number", label: "Scale", default: 2, min: 0, max: 10, step: 2, },
    {
      name: "mode",
      type: "select",
      label: "Mode",
      default: "a",
      options: [
        { label: "A", value: "a", },
        { label: "B", value: "b", },
      ],
    },
  ],);

  it("names the parameter, bound and received value below min / above max", () => {
    const low = validateRunParams({ template: spec, params: { scale: -1, }, },);
    expect(low[0],).toContain("scale",);
    expect(low[0],).toContain("-1",);
    expect(low[0],).toContain("[0, 10]",);

    const high = validateRunParams({ template: spec, params: { scale: 11, }, },);
    expect(high[0],).toContain("scale",);
    expect(high[0],).toContain("11",);
    expect(high[0],).toContain("[0, 10]",);
  });

  it("rejects off-step numbers and accepts boundary values", () => {
    expect(validateRunParams({ template: spec, params: { scale: 3, }, },)[0],).toContain("step",);
    expect(validateRunParams({ template: spec, params: { scale: 0, }, },),).toEqual([],);
    expect(validateRunParams({ template: spec, params: { scale: 10, }, },),).toEqual([],);
  });

  it("rejects a select value outside its declared options", () => {
    const violations = validateRunParams({ template: spec, params: { mode: "c", }, },);
    expect(violations[0],).toContain("mode",);
    expect(violations[0],).toContain("c",);
    expect(violations[0],).toContain("a, b",);
  });

  it("aligns width/height to 8, not 64", () => {
    expect(validateRunParams({
      template: txt2img,
      params: { width: 1000, height: 1008, },
    },),).toEqual([],);

    const violations = validateRunParams({
      template: txt2img,
      params: { width: 1001, },
    },);

    expect(violations.some((message,) => message.includes("width",) && message.includes("8",)),).toBe(true,);
  });

  it("accepts a 64-bit seed and rejects values past the widened max", () => {
    const seed = 2 ** 53 - 1;
    expect(validateRunParams({ template: txt2img, params: { seed, }, },),).toEqual([],);

    const violations = validateRunParams({
      template: txt2img,
      params: { seed: 2 ** 53, },
    },);

    expect(violations.some((message,) => message.includes("seed",)),).toBe(true,);
  });
});

describe("discovered sampling axes", () => {
  const spec = template([
    {
      name: "sampler",
      type: "select",
      label: "Sampler",
      default: "euler",
      // Static options are advisory UX; discovery supersedes them.
      options: [{ label: "Euler", value: "euler", },],
    },
    { name: "scheduler", type: "string", label: "Scheduler", default: "simple", },
  ],);

  const sampling = {
    samplers: ["euler", "ddim",],
    schedulers: ["simple", "karras",],
    reachable: true,
    timestamp: 0,
  };

  it("rejects an invalid sampler and names the discovered values", () => {
    const violations = validateRunParams({
      template: spec,
      params: { sampler: "bogus", scheduler: "karras", },
      sampling,
    },);

    expect(violations,).toHaveLength(1,);
    expect(violations[0],).toContain("sampler",);
    expect(violations[0],).toContain("bogus",);
    expect(violations[0],).toContain("euler, ddim",);
  });

  it("uses discovery, not the static option list, for valid values", () => {
    expect(validateRunParams({
      template: spec,
      params: { sampler: "ddim", scheduler: "simple", },
      sampling,
    },),).toEqual([],);
  });

  it("skips enum validation when discovery is unavailable", () => {
    expect(validateRunParams({
      template: spec,
      params: { sampler: "unlisted", scheduler: "unlisted", },
      sampling: { ...sampling, reachable: false, samplers: [], schedulers: [], },
    },),).toEqual([],);

    expect(validateRunParams({
      template: spec,
      params: { sampler: "unlisted", scheduler: "unlisted", },
    },),).toEqual([],);
  });
});
