// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset alpha state machine.
 *
 * Tracks the cut-out readiness of image assets for VN sprite compositing:
 * unknown → raw → matting_pending → matted | matting_failed.
 * `native` marks images that already carry alpha (provider transparency or
 * an upload with alpha); they never need matting. `matted` / `matting_failed`
 * may re-enter `matting_pending` when the job is re-run with a newer model.
 */
import { AssetAlphaStatus, } from "../../db/enums";

const ALLOWED: Readonly<Record<AssetAlphaStatus, readonly AssetAlphaStatus[]>> = {
  [AssetAlphaStatus.Unknown]: [],
  [AssetAlphaStatus.Native]: [],
  [AssetAlphaStatus.Raw]: [AssetAlphaStatus.MattingPending,],
  [AssetAlphaStatus.MattingPending]: [
    AssetAlphaStatus.Matted,
    AssetAlphaStatus.MattingFailed,
  ],
  [AssetAlphaStatus.Matted]: [AssetAlphaStatus.MattingPending,],
  [AssetAlphaStatus.MattingFailed]: [AssetAlphaStatus.MattingPending,],
};

/**
 * Initial status for a freshly stored asset.
 * @param mimeType
 * @param hasAlpha header-detected alpha presence (non-image → false)
 */
export function initialAlphaStatus(mimeType: string, hasAlpha: boolean,): AssetAlphaStatus {
  if (!mimeType.startsWith("image/",)) { return AssetAlphaStatus.Unknown; }
  return hasAlpha ? AssetAlphaStatus.Native : AssetAlphaStatus.Raw;
}

/**
 * Whether the `from → to` transition is part of the alpha state machine.
 * @param from
 * @param to
 */
export function canTransitionAlphaStatus(
  from: AssetAlphaStatus,
  to: AssetAlphaStatus,
): boolean {
  return ALLOWED[from].includes(to,);
}
