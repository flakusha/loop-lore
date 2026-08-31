// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { TransportProtocol, } from "../db/enums";

import { TransportBase, type TransportBaseOptions, } from "./base";

interface Http1Options extends TransportBaseOptions {
  fetch?: (request: Request,) => Response | Promise<Response>;
}

/** */
export class Http1Handler extends TransportBase<Http1Options> {
  /**
   * @param options
   */
  constructor(options: Http1Options = {},) {
    super(options,);
  }

  /** */
  protected getProtocol(): TransportProtocol {
    return TransportProtocol.Http1_1;
  }

  /** */
  protected getMetadata(): Record<string, unknown> {
    return {
      keepAlive: true,
      maxIdleTime: 30_000,
    };
  }

  /**
   * @param _data
   */
  send(_data: string | Uint8Array,): Promise<void> {
    this.ensureConnected();
    return Promise.resolve();
  }
}

/**
 * @param options
 */
export function createHttp1Handler(options: Http1Options = {},): Http1Handler {
  return new Http1Handler(options,);
}
