// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Creation Wizard ───────────────────────────────────────
/** State + methods for the multi-step LLM entity creation wizard. */
export interface ChatWizardState {
  /** Draft being previewed (null when wizard closed). */
  wizardDraft: {
    wizardId: string;
    entityType: string;
    label: string;
    fields: Record<string, string | undefined>;
    worldId?: string;
    userId?: string;
    description?: string;
    warnings?: string[];
  } | null;
  wizardPreviewOpen: boolean;
  /** Current multi-step wizard position (1-based). */
  wizardStep: number;
  wizardTotalSteps: number;
  confirmWizard(wizardId: string,): Promise<void>;
  cancelWizard(wizardId: string,): Promise<void>;
  updateWizardField(field: string, value: string,): void;
  wizardNextStep(): void;
  wizardPrevStep(): void;
  wizardResetSteps(): void;
}
