// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ProfileSummary as ProfileSummaryType, } from "../../../validation/schemas/responses";

export type ProfileSummary = ProfileSummaryType;

export interface ProfileDetail extends ProfileSummary {
  templates: Record<string, Record<string, string>>;
}

export interface EditingTemplate {
  detail: string;
  mode: string;
  value: string;
}

export interface NewProfile {
  id: string;
  name: string;
  families: string;
  promptFormat: string;
  maxTokenHint: number;
}

export const DETAIL_LABELS: Record<string, string> = {
  instant: "Instant",
  balanced: "Balanced",
  detailed: "Detailed",
};

export const MODE_LABELS: Record<string, string> = {
  yourself: "Yourself",
  face: "Face",
  me: "Me",
  scene: "Scene",
  last: "Last",
  background: "Background",
};

export interface AdminTemplates {
  // List state
  templateProfiles: ProfileSummary[];
  defaultProfileId: string;
  builtinCount: number;
  customCount: number;
  loadingTemplates: boolean;
  // Detail view state
  selectedProfile: ProfileDetail | null;
  // Inline edit state
  editingTemplate: EditingTemplate | null;
  savingTemplate: boolean;
  // Create modal state
  showCreateModal: boolean;
  newProfile: NewProfile;

  loadTemplates(): Promise<void>;
  selectProfile(id: string,): Promise<void>;
  clearSelection(): void;
  deleteProfile(id: string,): Promise<void>;
  startEditTemplate(detail: string, mode: string, value: string,): void;
  cancelEditTemplate(): void;
  saveTemplate(): Promise<void>;
  saveDefaults(): Promise<void>;
  createProfile(): Promise<void>;
  formatDetail(detail: string,): string;
  formatMode(mode: string,): string;
}
