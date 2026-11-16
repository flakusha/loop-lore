// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LSP wire protocol: JSON-RPC error codes, the parsed message shape, and the
 * Content-Length frame parser for the stdio byte stream.
 */

/** JSON-RPC error codes this server answers with (LSP + JSON-RPC standard). */
export const LSP_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  serverNotInitialized: -32002,
  /** Auth and dispatch failures (LSP `RequestFailed`). */
  requestFailed: -32803,
} as const;

/** One parsed JSON-RPC message (batch arrays are rejected, not served). */
export interface LspMessage {
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

/**
 * Build the Content-Length frame parser for the stdio byte stream: feed it
 * raw stdin chunks, it calls `onMessage` once per complete `Content-Length`
 * frame. Buffer-based so a multibyte character split across chunks survives.
 * @param onMessage - receives each complete frame body as UTF-8 text
 * @returns the chunk feeder for one stdio connection
 */
export function createLspFrameParser(onMessage: (text: string,) => void,): (chunk: Buffer,) => void {
  let pending = Buffer.alloc(0,);

  return (chunk: Buffer,): void => {
    pending = Buffer.concat([pending, chunk,],);

    for (;;) {
      const crlf = pending.indexOf("\r\n\r\n",);
      const lf = pending.indexOf("\n\n",);
      const end = crlf !== -1 && (lf === -1 || crlf < lf) ? crlf + 4 : lf !== -1 ? lf + 2 : -1;
      if (end === -1) { return; }

      const header = pending.subarray(0, end,).toString("latin1",);
      const match = /content-length:\s*(\d+)/i.exec(header,);
      pending = pending.subarray(end,);
      if (!match?.[1]) { continue; }

      const length = Number(match[1],);
      if (pending.length < length) {
        // Body incomplete — put the ASCII header back and wait for more.
        pending = Buffer.concat([Buffer.from(header, "latin1",), pending,],);
        return;
      }

      onMessage(pending.subarray(0, length,).toString("utf8",),);
      pending = pending.subarray(length,);
    }
  };
}
