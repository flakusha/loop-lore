// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI parameter derivation — shared shapes.
 *
 * Derives a workflow-library row's `TemplateParameter[]` from `[p]`-marked
 * node titles in a saved UI-format workflow, typed by a pinned
 * `/object_info` snapshot. Marks survive the editor round-trip because they
 * live in the node `title`, which the frontend persists verbatim.
 *
 * Pipeline: `collectMarked` (marks.ts) → `mapSpecToParam` (type-map.ts) →
 * `applySidecar` (sidecar.ts) → `injectPlaceholders` (inject.ts). The
 * converted API graph is the injection target: `convertWorkflow` runs first,
 * then whole-string `{{name}}` tokens are written at the marked inputs via
 * `applyNodeOverrides`, so `substituteWorkflow`/`uploadImageParams` work
 * unchanged. Offline throughout — the snapshot is a committed fixture.
 *
 * @module comfyui-params/types
 */
import type { TemplateParameter, } from "../../image-edit/types";
import type { Brand, } from "../../utils/brands";
import type { ApiGraph, ObjectInfoSnapshot, UiWorkflow, } from "../comfyui-converter/types";
import type { SidecarOverrides, } from "./sidecar";

/** A derived parameter name: unique per workflow, used as the `{{var}}`. */
export type ParameterName = Brand<string, "ComfyParamName">;

/** Where a derived `select`'s options come from. */
export type OptionSource = "static" | "runtime";

/** A derived parameter: the row type plus the option-source marker. */
export interface DerivedParameter {
  readonly parameter: TemplateParameter;
  readonly optionSource: OptionSource | null;
}

/** Options for {@link deriveParameters}. */
export interface DeriveOptions {
  readonly workflow: UiWorkflow;
  readonly converted: ApiGraph;
  readonly workflowId: string;
  readonly snapshot: ObjectInfoSnapshot;
  readonly sidecar?: SidecarOverrides;
  readonly existing?: readonly TemplateParameter[];
}

/** Derived parameters plus the `{{var}}` override map for injection. */
export interface DeriveResult {
  readonly parameters: TemplateParameter[];
  readonly overrides: ReadonlyMap<string, Readonly<Record<string, string>>>;
}
