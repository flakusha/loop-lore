// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Parameter derivation failure modes.
 * @module comfyui-params/errors
 */

/** Parameter derivation failure modes, thrown as `ParameterDerivationError` causes. */
export type ParameterDerivationFailure =
  | { readonly kind: "unknown-override-target"; readonly target: string }
  | { readonly kind: "duplicate-parameter"; readonly name: string }
  | { readonly kind: "unknown-class"; readonly node: string; readonly type: string };

/**
 * Thrown when marked parameters cannot be derived offline.
 * @throws Never thrown implicitly — this IS the thrown type.
 */
export class ParameterDerivationError extends Error {
  readonly failure: ParameterDerivationFailure;
  constructor(failure: ParameterDerivationFailure,) {
    super(`comfyui-params: ${failure.kind}: ${describeFailure(failure,)}`,);
    this.name = "ParameterDerivationError";
    this.failure = failure;
  }
}

function describeFailure(failure: ParameterDerivationFailure,): string {
  switch (failure.kind) {
    case "unknown-override-target":
      return failure.target;
    case "duplicate-parameter":
      return failure.name;
    case "unknown-class":
      return `${failure.type} at ${failure.node}`;
  }
}
