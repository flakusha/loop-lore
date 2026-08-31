// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/transport/errors.ts — Transport error types

import { TransportErrorCode, } from "../db/enums";

/**
 * Unified transport error with recovery metadata.
 * @example
 * ```ts
 * throw new TransportError("protocol not supported", { code: TransportErrorCode.ProtocolUnsupported, recoverable: false });
 * ```
 */
export class TransportError extends Error {
  public readonly code: TransportErrorCode;
  public readonly recoverable: boolean;

  /**
   * @param message
   * @param options
   * @param options.cause
   * @param options.code
   * @param options.recoverable
   */
  constructor(
    message: string,
    options?: { cause?: Error; code?: TransportErrorCode; recoverable?: boolean },
  ) {
    super(message, options,);
    this.name = "TransportError";
    this.code = options?.code ?? TransportErrorCode.ProtocolUnsupported;
    this.recoverable = options?.recoverable ?? false;
  }
}

export { TransportErrorCode, } from "../db/enums";
