// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Composed Builder-tab state. The list, editor, and run halves each declare
 * `Partial<ComfyuiBuilder>`, so the spread keeps every member optional in
 * TS's eyes even though the merge yields the whole thing at runtime — the
 * `admin-workflows` composition pattern.
 */
import { builderListState, } from "./chains";
import { builderFormState, } from "./form";
import { builderRunState, } from "./run";
import type { ComfyuiBuilder, } from "./types";

export const comfyuiBuilderState = {
  ...builderListState,
  ...builderFormState,
  ...builderRunState,
} as unknown as ComfyuiBuilder;
