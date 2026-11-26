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

/** Largest accepted frame body (8 MiB); a bad frame must not grow the buffer without bound. */
const MAX_FRAME_BYTES = 8 * 1024 * 1024;

/**
 * Parse a frame body length from its header.
 * @param header - raw ASCII header text, terminator included
 * @returns the byte length, or null when the header is missing/invalid/oversized
 */
function frameLength(header: string,): number | null {
  // Capture the whole value so "1.5" is rejected, not silently truncated.
  const raw = /content-length:\s*([^\r\n]*)/i.exec(header,)?.[1]?.trim();
  if (raw === undefined || !/^\d+$/.test(raw,)) { return null; }
  const length = Number(raw,);
  return Number.isSafeInteger(length,) && length <= MAX_FRAME_BYTES ? length : null;
}

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
      if (end === -1) {
        // No header terminator: drop a garbage stream before it grows unbounded.
        if (pending.length > MAX_FRAME_BYTES) { pending = Buffer.alloc(0,); }
        return;
      }

      const header = pending.subarray(0, end,).toString("latin1",);
      const length = frameLength(header,);
      if (length === null) {
        // Invalid frame: drop everything so a bad frame cannot grow the buffer.
        pending = Buffer.alloc(0,);
        return;
      }

      pending = pending.subarray(end,);
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
