// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message attachments — caller-ownership verification.
 *
 * Attachments arrive as caller-supplied asset ids; linking them must not
 * bypass the per-asset ownership gate enforced by the asset routes.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** Error thrown when an attachment references an asset the caller does not own. */
export class AttachmentOwnershipError extends Error {
  constructor(assetId: string,) {
    super(`Asset ${assetId} is not owned by the caller`,);
    this.name = "AttachmentOwnershipError";
  }
}

/**
 * Verify every attachment asset exists and is owned by `ownerId`.
 * Throws {@link AttachmentOwnershipError} on the first violation.
 */
export async function verifyAttachmentsOwned(
  database: Kysely<DB>,
  attachments: { assetId: string }[],
  ownerId: string,
): Promise<void> {
  const ids = attachments.map((a,) => a.assetId);
  if (ids.length === 0) { return; }

  const rows = await database
    .selectFrom("assets",)
    .select(["id", "owner_id",],)
    .where("id", "in", ids,)
    .execute();
  const ownerById = new Map(rows.map((r,) => [r.id, r.owner_id,] as const),);

  for (const a of attachments) {
    if (ownerById.get(a.assetId,) !== ownerId) {
      throw new AttachmentOwnershipError(a.assetId,);
    }
  }
}
