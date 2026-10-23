// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The image-edit run body is the contract every entry point shares: the HTTP
 * route validates the body against it, and so does the chain-run executor,
 * which calls the run handler directly and never passes through the route.
 */
import { describe, expect, test, } from "bun:test";
import type { ImageEditTemplateSpec, } from "./image-edit";
import {
  imageEditBodyFields,
  invalidImageParams,
  missingRequiredParams,
  validateImageEditBody,
} from "./image-edit";

/** A template with a required text parameter and a required image parameter. */
const template: ImageEditTemplateSpec = {
  parameters: [
    { name: "prompt", type: "string", required: true, },
    { name: "input_image", type: "image", required: true, },
  ],
};

describe("image-edit run body", () => {
  test("accepts a body with the required fields", () => {
    const result = validateImageEditBody({ template_id: "img2img", backend: "comfyui", params: { prompt: "a cat", }, },);

    expect(result.ok,).toBe(true,);
  });

  test("names the field a missing required field is missing", () => {
    const result = validateImageEditBody({ backend: "comfyui", },);

    expect(result.ok,).toBe(false,);
    expect(result.ok ? [] : result.fields,).toEqual(["template_id",],);
  });

  test("names a field of the wrong type", () => {
    const result = validateImageEditBody({ template_id: "img2img", backend: "comfyui", params: "nope", },);

    expect(result.ok,).toBe(false,);
    expect(result.ok ? [] : result.fields,).toEqual(["params",],);
  });

  test("reports the top-level field a nested issue belongs to", () => {
    expect(imageEditBodyFields({ template_id: 42, backend: "comfyui", },),).toEqual(["template_id",],);
  });

  test("a valid body has no offending field", () => {
    expect(imageEditBodyFields({ template_id: "img2img", backend: "comfyui", },),).toEqual([],);
  });
});

describe("image-edit parameter checks", () => {
  test("lists the required parameters the run does not supply", () => {
    expect(missingRequiredParams(template, { prompt: "a cat", },),).toEqual(["input_image",],);
  });

  test("lists no missing parameter when the run supplies them all", () => {
    expect(missingRequiredParams(template, { prompt: "a cat", input_image: "asset-1", },),).toEqual([],);
  });

  test("lists the image parameters that do not carry an asset id", () => {
    expect(invalidImageParams(template, { input_image: 42, },),).toEqual(["input_image",],);
  });

  test("accepts an asset id for every image parameter", () => {
    expect(invalidImageParams(template, { input_image: "asset-1", },),).toEqual([],);
  });
});
