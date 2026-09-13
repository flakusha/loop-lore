// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Display-only prompt-analysis profile (mirrors server PromptAnalysis). */
export interface PromptAnalysisProfile {
  intent: string;
  clarity: number;
  issues: string[];
  suggestions: string[];
  confidence: number;
}

/** Composer prompt-analysis state and methods (epic-prompt-improvement). */
export interface ChatPromptAnalyzeState {
  /** True while an analyze call is in flight. */
  _analyzing: boolean;
  /** Last analysis profile for the display panel; never written to the draft. */
  _promptAnalysis: PromptAnalysisProfile | undefined;
  analyzePrompt(): Promise<void>;
  clearPromptAnalysis(): void;
}
