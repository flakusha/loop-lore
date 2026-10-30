// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Conversion failure modes.
 * @module comfyui-converter/errors
 */
import { jsonStringifyOr, } from "../../utils";

/** Conversion failure modes, thrown as `ConverterError` causes. */
export type ConverterFailure =
  | { readonly kind: "unknown-class"; readonly node: string; readonly type: string }
  | { readonly kind: "missing-subgraph"; readonly node: string; readonly definition: string }
  | { readonly kind: "malformed-link"; readonly detail: string }
  | { readonly kind: "malformed-workflow"; readonly detail: string };

/**
 * Thrown when a workflow cannot be converted offline.
 * @throws Never thrown implicitly — this IS the thrown type.
 */
export class ConverterError extends Error {
  readonly failure: ConverterFailure;
  constructor(failure: ConverterFailure,) {
    super(`comfyui-converter: ${failure.kind}: ${jsonStringifyOr(failure,)}`,);
    this.name = "ConverterError";
    this.failure = failure;
  }
}
