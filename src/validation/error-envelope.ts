// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Canonical API error envelope schema.
 *
 * Slice 1 covers the shape only: `{ error_code, message, details?,
 * request_id, retry_after_ms? }`. The legacy `jsonError` wire shape
 * (`{ error, code, meta }`) is untouched — migration lands in a later slice.
 */

import type { Static, } from "@sinclair/typebox";
import { t, } from "elysia";

/** Canonical error envelope returned by `errorHandler` (src/api). */
export const ErrorEnvelope = t.Object({
  error_code: t.String(),
  message: t.String(),
  details: t.Optional(t.Unknown(),),
  request_id: t.String(),
  retry_after_ms: t.Optional(t.Number(),),
},);

/** Typed form of the canonical error envelope. */
export type ErrorEnvelope = Static<typeof ErrorEnvelope>;
