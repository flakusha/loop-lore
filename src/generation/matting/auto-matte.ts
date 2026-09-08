// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting — auto-enqueue helper for generation pipelines.
 *
 * Opaque generated sprites (alpha_status `raw`) are enqueued for background
 * removal without blocking the generation flow; enqueue skips are logged.
 */
import type { Kysely, } from "kysely";
import { AssetAlphaStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { MattingService, } from "./service";
import type { MattingProvider, } from "./types";

/**
 * Enqueue matting for a freshly generated asset when eligible.
 * @param root0
 * @param root0.database
 * @param root0.uploadDir
 * @param root0.assetId
 * @param root0.alphaStatus
 * @param root0.ownerId
 * @param root0.provider
 */
export async function enqueueAutoMatting({
  database,
  uploadDir,
  assetId,
  alphaStatus,
  ownerId,
  provider,
}: {
  database: Kysely<DB>;
  uploadDir: string;
  assetId: string;
  alphaStatus: AssetAlphaStatus;
  ownerId: string;
  provider: MattingProvider | undefined;
},): Promise<void> {
  if (!provider || alphaStatus !== AssetAlphaStatus.Raw) { return; }

  const matting = new MattingService({
    database,
    uploadDir,
    resolveProvider: () => provider ?? null,
  },);
  const enqueued = await matting.startMatting({ assetId, ownerId, },);
  if (!enqueued.ok) {
    getLogger().warn({ event: "matting.auto_enqueue_skipped", assetId, reason: enqueued.error, },);
  }
}
