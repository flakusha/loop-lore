// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * State types for the admin Builder tab (Track A preset chains).
 *
 * The form is template-pick → params → order → run; there is no canvas.
 */
import type { TemplateParameter, } from "../../../image-edit/types";

/** Template summary as `GET /image-edit/templates` serves it. */
export interface BuilderTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  backends: string[];
  parameters: TemplateParameter[];
}

/** One editing step (wire shape matches `ChainStep`). */
export interface BuilderStep {
  id: string;
  templateId: string;
  params: Record<string, string | number | boolean>;
}

/** One chain as the CRUD routes serve it. */
export interface BuilderChain {
  id: string;
  name: string;
  description: string | null;
  steps: BuilderStep[];
  createdAt: string;
  updatedAt: string;
}

/** Run status shown by the tab. */
export interface BuilderRunState {
  jobId: string;
  status: string;
  error: string;
  completedSteps: number;
  totalSteps: number;
}

/** The whole Builder tab component. */
export interface ComfyuiBuilder {
  // ── List ────────────────────────────────────────────
  chains: BuilderChain[];
  loadingChains: boolean;
  chainsError: string;
  templates: BuilderTemplate[];
  confirmDeleteChain: string;

  // ── Editor ──────────────────────────────────────────
  showEditor: boolean;
  editingId: string;
  editName: string;
  editDescription: string;
  steps: BuilderStep[];
  pickedTemplateId: string;
  savingChain: boolean;
  saveError: string;

  // ── Palette + run ───────────────────────────────────
  palette: Record<string, { display_name: string; category: string }>;
  loadingPalette: boolean;
  paletteError: string;
  runState: BuilderRunState;

  // ── Actions ─────────────────────────────────────────
  init(): Promise<void>;
  loadChains(): Promise<void>;
  loadTemplates(): Promise<void>;
  openCreate(): void;
  openEdit(id: string,): void;
  closeEditor(): void;
  addStep(): void;
  removeStep(index: number,): void;
  moveStep(index: number, delta: number,): void;
  setStepParam(index: number, name: string, value: unknown,): void;
  saveChain(): Promise<void>;
  deleteChain(id: string,): Promise<void>;
  loadPalette(): Promise<void>;
  startRun(chainId: string,): Promise<void>;
  pollRun(): Promise<void>;
}

/**
 * A blank editor.
 * @returns {Pick<ComfyuiBuilder, "editingId" | "editName" | "editDescription" | "steps" | "pickedTemplateId" | "saveError">} empty editor fields.
 */
export function emptyEditor(): Pick<
  ComfyuiBuilder,
  "editingId" | "editName" | "editDescription" | "steps" | "pickedTemplateId" | "saveError"
> {
  return {
    editingId: "",
    editName: "",
    editDescription: "",
    steps: [],
    pickedTemplateId: "",
    saveError: "",
  };
}
