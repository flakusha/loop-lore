// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/templates-classifiers.ts — classifier template-pack
// types (split from templates.ts; re-exported there so existing
// ../sections/templates import paths keep working).

import type { AuxTaskName, } from "@/aux-pipeline/types";
import type { ChatMode, } from "@/db/enums-core/users";
import type { MergeStrategy, } from "./templates";

// ── Classifier Template Packs (epic-classifier-template-packs) ──

/** Structured `when` guards — every declared guard must hold for a match. */
export interface ClassTemplateWhen {
  /** Chat mode whitelist (chats.mode): direct | group | story | battle. */
  chatMode?: ChatMode[];
}

/** Sampling/timeout overrides a selected pack applies to its aux call. */
export interface ClassTemplateParams {
  /** Per-call timeout in ms. */
  timeoutMs?: number;
  /** Sampling temperature. */
  temperature?: number;
  /** Max output tokens. */
  maxTokens?: number;
}

/**
 * One user-supplied classifier template (a "pack" entry). Selection:
 * `serves` includes the task AND every `when` guard holds AND `tags` ⊆ query
 * tags; highest `priority` wins. Every key has a runtime consumer in
 * `src/aux-pipeline/class-template-select.ts`.
 */
export interface ClassTemplateConfig {
  /** Unique template id; user files layer over shipped ones by id. */
  id: string;
  /** Human-readable label (admin/search UIs). */
  name: string;
  /** What the template decides; documentation + search. */
  description?: string;
  /** Aux decision points this template can answer. */
  serves: AuxTaskName[];
  /** Context tags required on the query (chat-active ∪ actor-trait). */
  tags: string[];
  /** Optional structured guards (all must hold). */
  when?: ClassTemplateWhen;
  /** Among matching templates the highest priority wins. Default 0. */
  priority?: number;
  /** Sampling overrides threaded into the aux call when selected. */
  params?: ClassTemplateParams;
  /** Expected output vocabulary (documentation + parse validation hint). */
  labels?: string[];
  /** The system prompt replacing the resolved purpose default. */
  template: string;
}

/** Classifier template-pack configuration (multi-file: classifiers/*.yaml). */
export interface ClassifiersTemplateConfig {
  merge: MergeStrategy;
  /** Packs keyed by id. */
  classifiers: Record<string, ClassTemplateConfig>;
}
