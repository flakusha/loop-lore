// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { PromptTemplateInfo, } from "../types";

/** Per-chat prompt-template preview + override state (chat settings modal). */
export interface ChatPromptTemplateState {
  /** Resolved prompt preview for the settings modal; null until loaded. */
  _promptTemplate: PromptTemplateInfo | null;
  _promptLoading: boolean;
  _promptExpanded: boolean;
  _promptOverrideDraft: string;
  _promptOverrideSaving: boolean;
  loadPromptTemplate(): Promise<void>;
  savePromptOverride(): Promise<void>;
}
