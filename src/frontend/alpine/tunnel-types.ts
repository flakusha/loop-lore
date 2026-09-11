// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 36

/** Connection lifecycle state. */
export type TunnelStatus = "closed" | "connecting" | "open" | "reconnecting" | "failed";

/** Minimal socket surface (real WebSocket satisfies this). */
export interface TunnelSocket {
  send(data: string,): void;
  close(): void;
  onopen: ((event: unknown,) => void) | null;
  onmessage: ((event: { data: unknown },) => void) | null;
  onclose: ((event: unknown,) => void) | null;
  onerror: ((event: unknown,) => void) | null;
}

/** Injectable seams for tests. */
export interface TunnelConnectorDeps {
  openSocket?: (url: string,) => TunnelSocket;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number,) => Promise<void>;
  maxAttempts?: number;
  onStatus?: (status: TunnelStatus,) => void;
}

/** Thrown when the tunnel cannot serve — callers fall back to server. */
export class TunnelUnavailable extends Error {
  constructor(reason = "tunnel unavailable",) {
    super(reason,);
    this.name = "TunnelUnavailable";
  }
}
