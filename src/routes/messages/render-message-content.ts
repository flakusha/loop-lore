// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Render-time message content helpers.
 *
 * Extracted from helpers.ts to stay under the 250L file-size gate.
 */
import type { Kysely, } from "kysely";
import type { RegexTransform, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { applyRegexTransforms, } from "../../generation/transforms";
import { resolveMessageContent, } from "./helpers";

/**
 * Render-time variant of resolveMessageContent.
 *
 * BUG-regex-transform-runs-at-store-time-not-render-time: applies the
 * configured regex output transforms after decryption/decompression so
 * the stored ciphertext/plaintext stays intact and a config change
 * takes effect on the next render. Pass `transforms = []` (or omit) to
 * skip — the message list endpoint uses this so user-visible content
 * always reflects the current config.
 */
export async function resolveMessageContentForRender(
  database: Kysely<DB>,
  message: {
    content: string;
    content_encoding: string;
    key_id: string | null;
    chat_id: string;
  },
  transforms: ReadonlyArray<RegexTransform> = [],
): Promise<string> {
  const plaintext = await resolveMessageContent(database, message,);
  if (transforms.length === 0) { return plaintext; }
  const result = applyRegexTransforms(plaintext, transforms as RegexTransform[],);
  return result.text;
}
