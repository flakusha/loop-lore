// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI parameter derivation — public API.
 *
 * Derives a workflow-library row's `TemplateParameter[]` from `[p]`-marked
 * node titles in a saved UI-format workflow, typed by a pinned
 * `/object_info` snapshot. See `types.ts` for the pipeline contract.
 *
 * @module comfyui-params
 */
export { deriveParameters, } from "./derive";
export { ParameterDerivationError, } from "./errors";
export type { ParameterDerivationFailure, } from "./errors";
export { injectPlaceholders, resolveBindings, } from "./inject";
export type { InjectedPlaceholder, InjectOptions, ResolveOptions, } from "./inject";
export { collectMarked, MARK_PREFIX, } from "./marks";
export type { CollectMarksOptions, MarkedInput, MarkedNodeId, MarkedTarget, } from "./marks";
export { applySidecar, } from "./sidecar";
export type { ApplySidecarOptions, SidecarOverride, SidecarOverrides, } from "./sidecar";
export { boundsOf, specOf, specTagOf, staticOptions, } from "./spec-shape";
export type { SpecBounds, } from "./spec-shape";
export { mapSpecToParam, } from "./type-map";
export type { TypeMappingInput, } from "./type-map";
export type { DerivedParameter, DeriveOptions, DeriveResult, OptionSource, ParameterName, } from "./types";
