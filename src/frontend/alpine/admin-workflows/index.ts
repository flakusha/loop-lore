// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Composed admin-workflows state for the ComfyUI workflow library tab.
 *
 * The list and editor halves each declare `Partial<AdminWorkflows>`, so the
 * spread keeps every member optional in TS's eyes even though the merge yields
 * the whole thing at runtime. Cast through `unknown` for the same reason
 * `admin-models` does.
 */
import { workflowFormState, } from "./form";
import { workflowListState, } from "./list";
import type { AdminWorkflows, } from "./types";

export const adminWorkflows = {
  ...workflowListState,
  ...workflowFormState,
} as unknown as AdminWorkflows;
