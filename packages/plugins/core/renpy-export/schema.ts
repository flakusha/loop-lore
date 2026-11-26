// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ren'Py export request validation — one DTO: the chat ids to export.
 * Parsed at the route boundary; the handler only sees typed values.
 */
import { Type, type Static, } from "@sinclair/typebox";
import { parseSchema, type ParseResult, } from "../../validation";

/** POST /api/renpy/export@v1 body. */
export const ExportBody = Type.Object({
  chatIds: Type.Array(Type.String({ minLength: 1, }), { minItems: 1, maxItems: 50, }),
},);

export type ExportBody = Static<typeof ExportBody>;

/**
 * Parse the export request body.
 * @param payload - untrusted JSON body
 * @returns typed chat ids or a readable error
 */
export function parseExportBody(payload: unknown,): ParseResult<ExportBody> {
  return parseSchema(ExportBody, payload, {
    chatIds: "chatIds must be 1-50 chat ids",
  },);
}
