// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Sender-side peer workload client (TASK-federation-peer-workload-wire-endpoints).
 *
 * Posts one workload to `{origin}/api/peer-work/run` and reassembles the
 * newline-delimited JSON chunk stream back into a `GenerateResponse`. Built on
 * the existing `safeFetch` seam (per-peer CA bundle, abort handling) rather than
 * a new transport — the epic rejected a WebSocket channel precisely because it
 * would mean inventing an envelope, auth and correlation from scratch.
 *
 * A peer attempt is ONE attempt. It never retries and never falls through to
 * another peer: the single local/remote failover decision belongs to
 * ./peer-dispatch. `emitted` reports how many chunks already reached the caller
 * before the failure, which is what lets the dispatcher honour the
 * discard-partial-output rule instead of concatenating two generations.
 *
 * `callerOrigin` is REQUIRED: the receiver authorizes the CALLER, so a sender
 * that cannot name itself has no business reaching the wire. It used to send
 * the destination's own origin, which made every offload between two distinct
 * instances fail — the receiver looked the destination up in its own registry,
 * never found it, and refused with `federation.workload_peer_untrusted`.
 */
import { type FederationPeerTrustConfig, } from "../config/schema";
import { type ChunkEvent, type GenerateResponse, } from "../generation/providers/types";
import { safeFetch, } from "../utils/safe-fetch";
import {
  assemblePeerWorkChunks,
  parsePeerWorkChunkLine,
  PEER_ORIGIN_HEADER,
  PEER_WORK_RUN_PATH,
  type PeerWorkErrorCode,
  type PeerWorkRunRequest,
  readPeerWorkErrorCode,
} from "./peer-work-wire";

/** Default per-attempt budget when the caller supplies none. */
export const PEER_WORK_DEFAULT_TIMEOUT_MS = 30_000;

/** Why an attempt failed, in terms a caller can branch on. */
export type PeerWorkFailureCode = PeerWorkErrorCode | "transport" | "protocol" | "aborted";

/** A failed peer attempt. Carries no peer payload. */
export interface PeerWorkFailure {
  code: PeerWorkFailureCode;
  status: number;
  message: string;
}

/** The outcome of one peer attempt. `emitted` is what the caller already saw. */
export type PeerWorkAttempt =
  | { ok: true; response: GenerateResponse; emitted: number }
  | { ok: false; failure: PeerWorkFailure; emitted: number };

/** The HTTP seam, injectable so tests never open a socket. */
export type PeerWorkTransport = (options: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal;
  trust: FederationPeerTrustConfig | undefined;
},) => Promise<Response>;

/** Default transport: `safeFetch` in streaming mode, so no response buffering. */
const fetchViaSafeFetch: PeerWorkTransport = async (options,) => {
  const result = await safeFetch<Response>(options.url, {
    method: "POST",
    body: options.body,
    headers: options.headers,
    signal: options.signal,
    stream: true,
    handle401: false,
    tls: options.trust?.caBundle === undefined ? undefined : { ca: [options.trust.caBundle,], },
  },);

  if (!result.ok) { throw result.error; }
  return result.data;
};

/** Read the human message out of an error envelope, if it carries one. */
function envelopeMessage(raw: unknown, fallback: string,): string {
  if (typeof raw !== "object" || raw === null) { return fallback; }
  const error = (raw as Record<string, unknown>).error;
  return typeof error === "string" ? error : fallback;
}

/** Parse a non-2xx error body into a routable failure. */
async function failureFromRejection(response: Response,): Promise<PeerWorkFailure> {
  let raw: unknown = null;
  try {
    raw = await response.json();
  } catch {
    raw = null;
  }

  const fallback = `peer workload rejected with ${response.status}`;
  const code = readPeerWorkErrorCode(raw,);
  return code === null
    ? { code: "transport", status: response.status, message: envelopeMessage(raw, fallback,), }
    : { code, status: response.status, message: envelopeMessage(raw, fallback,), };
}

/**
 * Run one workload on a peer.
 * @param options
 * @param options.callerOrigin This instance's own origin — the identity the receiver authorizes.
 * @param options.peer Origin to call.
 * @param options.request The minimized wire request.
 * @param options.bearer Per-peer shared credential, when the peer's auth mode needs one.
 * @param options.signal Caller cancellation; propagates into the peer request.
 * @param options.timeoutMs Per-attempt budget, independent of the caller's own.
 * @param options.onChunk Receives each chunk as it arrives, in order.
 * @param options.trust Per-peer CA/SPKI overrides.
 * @param options.transport Test seam; defaults to `safeFetch`.
 * @returns {Promise<PeerWorkAttempt>}
 */
export async function runPeerWorkload(options: {
  callerOrigin: string;
  peer: { origin: string };
  request: PeerWorkRunRequest;
  bearer: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  onChunk?: (chunk: ChunkEvent,) => void;
  trust?: FederationPeerTrustConfig;
  transport?: PeerWorkTransport;
},): Promise<PeerWorkAttempt> {
  const { callerOrigin, peer, request, bearer, signal, onChunk, trust, } = options;
  const timeoutMs = options.timeoutMs ?? PEER_WORK_DEFAULT_TIMEOUT_MS;
  const transport = options.transport ?? fetchViaSafeFetch;

  const attempt = new AbortController();
  const timer = setTimeout(() => {
    attempt.abort();
  }, timeoutMs,);

  const onAbort = (): void => {
    attempt.abort();
  };

  signal?.addEventListener("abort", onAbort, { once: true, },);

  const chunks: ChunkEvent[] = [];
  const protocolFailure = (message: string,): PeerWorkAttempt => ({
    ok: false,
    failure: { code: "protocol", status: 0, message, },
    emitted: chunks.length,
  });

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      [PEER_ORIGIN_HEADER]: callerOrigin,
    };

    if (bearer !== null) { headers.authorization = `Bearer ${bearer}`; }

    const response = await transport({
      url: `${peer.origin}${PEER_WORK_RUN_PATH}`,
      headers,
      body: request,
      signal: attempt.signal,
      trust,
    },);

    if (!response.ok) { return { ok: false, failure: await failureFromRejection(response,), emitted: 0, }; }
    if (response.body === null) { return protocolFailure("peer workload stream missing",); }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value, } = await reader.read();
      if (done) { break; }
      buffer += decoder.decode(value, { stream: true, },);

      for (let index = buffer.indexOf("\n",); index >= 0;) {
        const line = buffer.slice(0, index,);
        buffer = buffer.slice(index + 1,);
        const chunk = parsePeerWorkChunkLine(line,);
        if (chunk === null) {
          await reader.cancel();
          return protocolFailure("malformed peer workload chunk",);
        }

        if (chunk.type === "error") {
          await reader.cancel();
          return {
            ok: false,
            failure: { code: "transport", status: response.status, message: "peer workload attempt failed", },
            emitted: chunks.length,
          };
        }

        chunks.push(chunk,);
        onChunk?.(chunk,);
        index = buffer.indexOf("\n",);
      }
    }

    // The receiver terminates every line with a newline, so a non-empty
    // remainder is a TRUNCATED stream — a truncated answer, not a short one.
    if (buffer !== "") { return protocolFailure("truncated peer workload stream",); }

    const assembled = assemblePeerWorkChunks(chunks,);
    return assembled === null
      ? protocolFailure("peer workload stream did not complete",)
      : { ok: true, response: assembled, emitted: chunks.length, };
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: attempt.signal.aborted ? "aborted" : "transport",
        status: 0,
        message: error instanceof Error ? error.message : "peer workload unreachable",
      },
      emitted: chunks.length,
    };
  } finally {
    clearTimeout(timer,);
    signal?.removeEventListener("abort", onAbort,);
  }
}
