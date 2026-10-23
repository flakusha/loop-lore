// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Image-edit boundary contract.
 *
 * One schema module for the image-edit surface:
 *
 *   - `ImageEditRunBody` — the run request body (TypeBox, so the OpenAPI
 *     document the server serves carries the contract).
 *   - `validateImageEditBody` / `imageEditBodyFields` — the same schema
 *     applied to a body that reached the handler by another path: the
 *     chain-run executor calls `handleRun` directly, without the HTTP
 *     boundary.
 *   - `missingRequiredParams` / `invalidImageParams` — the template-parameter
 *     checks, so the HTTP route and the chain path cannot drift apart.
 *
 * The image-parameter contract: a parameter whose template type is `image`
 * carries the ASSET ID of an image the caller owns. The provider resolves the
 * id (owner check first, chat key when the asset is encrypted) and uploads
 * the bytes; a caller-supplied path is never read.
 */
import { type Static, Type, } from "@sinclair/typebox";
import { Value, } from "@sinclair/typebox/value";

/** Run request body. */
export const ImageEditRunBody = Type.Object({
  template_id: Type.String({ minLength: 1, maxLength: 200, description: "Id of the workflow template to run.", },),
  backend: Type.String({
    minLength: 1,
    maxLength: 32,
    description: "Backend that executes the template — `comfyui` or `sd-server`.",
  },),
  params: Type.Optional(
    Type.Record(
      Type.String(),
      Type.Unknown(),
      {
        description:
          "Template parameters. A parameter whose template type is `image` carries the asset id of an image the caller owns — not bytes and not a path — on the ComfyUI backend; the provider resolves the id and uploads the image to ComfyUI itself. The sd-server backend takes a base64 payload instead.",
      },
    ),
  ),
  chatId: Type.Optional(Type.String({ maxLength: 64, },),),
  messageId: Type.Optional(Type.String({ maxLength: 64, },),),
},);

/** The run body, as the schema types it. */
export type ImageEditRunBodyT = Static<typeof ImageEditRunBody>;

/** The template shape the parameter checks need. */
export interface ImageEditTemplateSpec {
  parameters: readonly { name: string; type: string; required?: boolean }[];
}

/** The outcome of a run-body check. */
export type ImageEditBodyCheck = { ok: true; value: ImageEditRunBodyT } | { ok: false; fields: string[] };

/**
 * The top-level body field a schema issue belongs to.
 * @param path - the issue path, e.g. "/params/input_image"
 * @returns {string} the field name, or "body" when the issue has no path
 */
function topField(path: string | undefined,): string {
  const first = (path ?? "").replace(/^\//, "",).split("/",)[0] ?? "";
  return first || "body";
}

/**
 * The body fields that do not satisfy the run schema.
 * @param value - the request body
 * @returns {string[]} the offending field names, empty when the body is valid
 */
export function imageEditBodyFields(value: unknown,): string[] {
  if (Value.Check(ImageEditRunBody, value,)) { return []; }
  const issues = [...Value.Errors(ImageEditRunBody, value,),];
  const fields = issues.map((issue) => topField(issue.path,),);
  return [...new Set(fields,),];
}

/**
 * Validate a run body against the shared schema.
 * @param value - the request body
 * @returns {ImageEditBodyCheck} the typed body, or the offending field names
 */
export function validateImageEditBody(value: unknown,): ImageEditBodyCheck {
  if (Value.Check(ImageEditRunBody, value,)) { return { ok: true, value: value as ImageEditRunBodyT, }; }
  return { ok: false, fields: imageEditBodyFields(value,), };
}

/**
 * The required template parameters a run does not supply.
 * @param template - the template whose parameters are checked
 * @param params - the run parameters
 * @returns {string[]} the missing parameter names, in template order
 */
export function missingRequiredParams(
  template: ImageEditTemplateSpec,
  params: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const parameter of template.parameters) {
    if (parameter.required && params[parameter.name] === undefined) { missing.push(parameter.name,); }
  }

  return missing;
}

/**
 * The image parameters whose value is not an asset id.
 *
 * An image parameter carries an asset id, so its value is a string. Anything
 * else (bytes, a number, an object) is rejected before the provider is
 * reached: the provider would have no way to resolve it to a file.
 * @param template - the template whose parameters are checked
 * @param params - the run parameters
 * @returns {string[]} the offending parameter names, in template order
 */
export function invalidImageParams(
  template: ImageEditTemplateSpec,
  params: Record<string, unknown>,
): string[] {
  const invalid: string[] = [];
  for (const parameter of template.parameters) {
    if (parameter.type !== "image") { continue; }
    const value = params[parameter.name];
    if (value === undefined || value === "") { continue; }
    if (typeof value !== "string") { invalid.push(parameter.name,); }
  }

  return invalid;
}
