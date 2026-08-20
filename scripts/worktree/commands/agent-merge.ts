// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Agent merge — alias for finalize
 */

import type { WorktreeConfig, } from "../utils/config";
import { finalize, } from "./finalize";

export async function agentMerge(
  args: string[],
  config: WorktreeConfig,
): Promise<void> {
  return finalize(args, config,);
}
