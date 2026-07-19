import { TransportProtocol, } from "../db/enums";

import { TransportBase, type TransportBaseOptions, } from "./base";

interface H2Options extends TransportBaseOptions {
  maxConcurrentStreams?: number;
}

export class H2Handler extends TransportBase<H2Options> {
  private streams = new Map<number, { read: Uint8Array[]; write: Uint8Array[] }>();

  constructor(options: H2Options = {},) {
    super(options,);
  }

  protected getProtocol(): TransportProtocol {
    return TransportProtocol.Http2;
  }

  protected getMetadata(): Record<string, unknown> {
    return {
      multiplexing: true,
      serverPush: true,
      maxConcurrentStreams: this.options.maxConcurrentStreams ?? 100,
    };
  }

  send(_data: string | Uint8Array,): Promise<void> {
    this.ensureConnected();
    return Promise.resolve();
  }

  override close(): Promise<void> {
    this.streams.clear();
    return super.close();
  }
}

export function createH2Handler(options: H2Options = {},): H2Handler {
  return new H2Handler(options,);
}
