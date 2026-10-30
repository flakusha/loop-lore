// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI UI→API workflow converter — public API.
 *
 * Offline, pure conversion of saved UI-format workflows to submittable
 * API-format graphs. See `types.ts` for the pipeline contract.
 *
 * @module comfyui-converter
 */
export { convertWorkflow, } from "./convert";
export { flattenWorkflow, isSubgraphReference, } from "./flatten";
export type { FlatNode, FlatWorkflow, } from "./flatten";
export { indexLinks, normalizeLink, } from "./links";
export type { FlatLink, } from "./links";
export { lookupClass, orderedInputs, widgetOrder, } from "./object-info";
export type {
  ApiGraph,
  ApiNode,
  ConversionResult,
  ConverterFailure,
  ConverterReport,
  ConvertOptions,
  ObjectInfoClass,
  ObjectInfoSnapshot,
  PackIdentity,
  PrunedDangling,
  SubgraphBoundaryPin,
  SubgraphDefinition,
  UiLink,
  UiLinkArray,
  UiLinkObject,
  UiNode,
  UiNodeInput,
  UiNodeOutput,
  UiWidgetRef,
  UiWorkflow,
  UnresolvedInput,
} from "./types";
export { ConverterError, } from "./types";
export { apiWidgetValue, linkedInputNames, mapWidgets, } from "./widgets";
export type { WidgetMapping, } from "./widgets";
export type { LiveSet, WireState, } from "./wire";
export { emptyWireState, wireNode, wireReport, } from "./wire";
