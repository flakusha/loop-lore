// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Peer dispatch, composed with — never conflated into — provider failover
 * (TASK-federation-peer-dispatch-compose-failover).
 *
 * The one rule this module exists to enforce: **a peer is never an
 * `LLMProvider`.** `callWithFailover` picks among local providers behind a
 * vendor circuit breaker; putting a peer in that list would trip a vendor's
 * breaker from a peer failure, offer a peer against a chat's sticky pin, and
 * silently add a remote candidate to the aux pipeline's deliberately
 * single-element list. So routing resolves BEFORE the scheduler is entered, and
 * this function owns the whole local/remote boundary:
 *
 *   - a LOCAL decision calls the caller's local thunk and nothing else — the
 *     same `scheduledCallWithFailover` path, byte for byte, with federation
 *     off, no eligible peer, or an empty matrix row;
 *   - a PEER decision makes exactly ONE remote attempt;
 *   - that attempt failing retries local EXACTLY ONCE. Two remote attempts are
 *     never made, and a local failure never goes remote;
 *   - partial output from a failed peer attempt is DISCARDED, never
 *     concatenated with the local retry. When bytes already reached the caller
 *     the attempt is reported failed instead, so nobody receives a reply
 *     silently assembled from two generations.
 */
import { GenerationCancelledError, } from "../generation/cancellation-actions/error";
import { type ChunkEvent, type GenerateResponse, } from "../generation/providers/types";
import { getChildLogger, } from "../logger";
import { runPeerAttempt, } from "./peer-health";
import { type PeerRouteDecision, } from "./peer-router";
import { type PeerWorkAttempt, type PeerWorkFailure, runPeerWorkload, } from "./peer-work-client";
import { type PeerWorkRunRequest, } from "./peer-work-wire";

/** The peer attempt failed and its partial output was discarded, not merged. */
export class PeerWorkPartialOutputError extends Error {
  /**
   * @param origin The peer that produced the discarded prefix.
   * @param failure Why the attempt stopped.
   */
  constructor(origin: string, failure: PeerWorkFailure,) {
    super(`peer workload at ${origin} failed after streaming began; partial output discarded`, {
      cause: failure,
    },);

    this.name = "PeerWorkPartialOutputError";
  }
}

/** Every hop failed: the one remote attempt and the one local retry. */
export class PeerWorkExhaustedError extends Error {
  /**
   * @param options
   * @param options.origin
   * @param options.failure Why the peer attempt stopped.
   * @param options.localError What the local retry threw.
   */
  constructor(options: { origin: string; failure: PeerWorkFailure; localError: unknown },) {
    super(`peer workload at ${options.origin} failed and the local retry also failed`, {
      cause: {
        peer: options.failure,
        local: options.localError instanceof Error ? options.localError.message : String(options.localError,),
      },
    },);

    this.name = "PeerWorkExhaustedError";
  }
}

/**
 * Dispatch one workload to the target the router chose.
 *
 * @param options
 * @param options.decision The router's decision. A local decision short-circuits.
 * @param options.request The minimized wire request for the peer attempt.
 * @param options.local The caller's unchanged local path (scheduled failover).
 * @param options.bearer Per-peer shared credential, when that peer needs one.
 * @param options.signal Caller cancellation, threaded into the peer attempt.
 * @param options.timeoutMs Per-attempt budget, independent of the caller's own.
 * @param options.onChunk Receives peer chunks as they arrive.
 * @param options.runPeer Attempt seam; production is `runPeerWorkload`.
 * @throws {GenerationCancelledError} when the caller's signal aborts.
 * @throws {PeerWorkPartialOutputError} when a failed peer attempt had already streamed.
 * @throws {PeerWorkExhaustedError} when the peer attempt and the local retry both fail.
 * @throws {Error} propagated from the local path when there was no peer attempt.
 * @returns {Promise<GenerateResponse>}
 */
export async function dispatchPeerWorkload(options: {
  decision: PeerRouteDecision;
  request: PeerWorkRunRequest;
  local: () => Promise<GenerateResponse>;
  bearer?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  onChunk?: (chunk: ChunkEvent,) => void;
  runPeer?: typeof runPeerWorkload;
},): Promise<GenerateResponse> {
  const { decision, request, local, signal, onChunk, } = options;
  if (decision.target === "local") {
    return local();
  }

  const log = getChildLogger("federation/peer-dispatch",);
  const { peer, } = decision;
  const attempt: PeerWorkAttempt = await runPeerAttempt(
    { origin: peer.origin, workloadClass: request.workloadClass, },
    () =>
      (options.runPeer ?? runPeerWorkload)({
        peer,
        request,
        bearer: options.bearer ?? null,
        ...(signal === undefined ? {} : { signal, }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs, }),
        ...(onChunk === undefined ? {} : { onChunk, }),
      },),
  );

  if (attempt.ok) {
    log?.info("peer workload served", { origin: peer.origin, workloadClass: request.workloadClass, },);
    return attempt.response;
  }

  // Cancellation is the caller's decision, not a peer failure to retry around.
  if (signal?.aborted === true && signal.reason instanceof GenerationCancelledError) {
    throw signal.reason;
  }

  if (attempt.emitted > 0) {
    log?.warn("peer workload discarded after streaming began", {
      origin: peer.origin,
      emitted: attempt.emitted,
      code: attempt.failure.code,
    },);

    throw new PeerWorkPartialOutputError(peer.origin, attempt.failure,);
  }

  log?.info("peer workload failed; retrying local once", {
    origin: peer.origin,
    code: attempt.failure.code,
  },);

  try {
    return await local();
  } catch (error) {
    log?.warn("local retry after peer failure also failed", { origin: peer.origin, },);
    if (error instanceof GenerationCancelledError) { throw error; }
    throw new PeerWorkExhaustedError({ origin: peer.origin, failure: attempt.failure, localError: error, },);
  }
}
