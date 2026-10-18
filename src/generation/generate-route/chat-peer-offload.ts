// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The ONE live composition point between peer routing and the chat turn
 * (TASK-federation-offload-adopt-dispatch-in-the-chat-turn-call-site).
 *
 * The epic's structural rule — **a peer is never an `LLMProvider`** — holds
 * only if a real call site resolves a route. Until this module existed,
 * `dispatchPeerWorkload` and `runPeerWorkload` were reachable from tests alone,
 * so no user request was ever eligible for offload. This is that seam.
 *
 *   1. CONFIG GATE (no query) — `federation.enabled` plus a declared `chat`
 *      class. Either false returns `local()` untouched.
 *   2. Pure `resolvePeerRoute` over real peers / matrix / stored pin.
 *   3. `{ target: "local" }` → `local()`, the caller's unchanged
 *      `scheduledCallWithFailover` thunk, invoked once and unmodified.
 *   4. `{ target: "peer" }` → `dispatchPeerWorkload` with that same thunk as
 *      `local`. The peer is NEVER added to `buildFailoverList`.
 *
 * **Off by default.** Step 1 is reached before the first DB read, so a default
 * deployment issues zero extra queries and takes the pre-existing code path.
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { PeerAuthMode, PeerWorkloadClass, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { publicOriginOf, } from "../../federation/gossip";
import { readAssignmentMatrix, } from "../../federation/peer-assignment-matrix";
import { declaredWorkloadClasses, } from "../../federation/peer-capabilities";
import { dispatchPeerWorkload, } from "../../federation/peer-dispatch";
import { listWorkloadPeers, } from "../../federation/peer-registry";
import { resolvePeerRoute, } from "../../federation/peer-router";
import { pinWorkloadPeer, readWorkAssignment, type WorkReleaseReason, } from "../../federation/peer-work-assignments";
import type { runPeerWorkload, } from "../../federation/peer-work-client";
import { type PeerWorkMessage, type PeerWorkRunRequest, } from "../../federation/peer-work-wire";
import { readPeerWorkloadToken, } from "../../federation/peer-workload-token";
import { getChildLogger, } from "../../logger";
import type { ChunkEvent, GenerateResponse, } from "../providers/types";
import type { GenerationMessage, } from "../types";

/** The one sticky workload class, and the affinity scope of every pin. */
const CLASS = PeerWorkloadClass.Chat;

/** The caller's own path, unchanged — the single local thunk everything falls back to. */
export type LocalGeneration = () => Promise<GenerateResponse>;

/** @see dispatchChatGeneration */
export interface ChatPeerOffloadOptions {
  database: Kysely<DB>;
  config: Config;
  /** The chat id. This — never a random key — is the stickiness affinity. */
  chatId: string;
  /** Correlates the two structured log lines. Never chat content. */
  attemptId: string;
  providerName: string;
  modelId: string;
  messages: readonly GenerationMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** The caller's existing SSE handler, so peer chunks stream exactly as local ones do. */
  onChunk?: (chunk: ChunkEvent,) => void;
  local: LocalGeneration;
  /** Test seam for the transport; production is the real loopback HTTP call. */
  runPeer?: typeof runPeerWorkload;
}

/**
 * Dispatch one chat turn to a peer, or to the caller's unchanged local path.
 *
 * Never throws for a peer-side reason: a peer that fails before emitting
 * anything is retried locally exactly once inside `dispatchPeerWorkload`, and a
 * peer that fails after emitting throws `PeerWorkPartialOutputError` so the
 * caller reports the turn failed rather than silently re-generating a reply the
 * client is already holding half of.
 *
 * @param options
 * @returns {Promise<GenerateResponse>}
 */
export async function dispatchChatGeneration(options: ChatPeerOffloadOptions,): Promise<GenerateResponse> {
  const { local, config, database, chatId, attemptId, } = options;

  if (config.federation?.enabled !== true) { return local(); }
  if (!declaredWorkloadClasses(config,).includes(CLASS,)) { return local(); }

  // The peer wire is `{ role, content }` only, so a turn carrying inline images
  // or tool calls would be silently mangled outbound. Those stay local.
  for (const message of options.messages) {
    if (message.images !== undefined || message.tool_calls !== undefined) { return local(); }
  }

  const log = getChildLogger("generation/chat-peer-offload",);
  const assignment = await readWorkAssignment(database, { affinityKey: chatId, workloadClass: CLASS, },);
  const decision = resolvePeerRoute({
    federationEnabled: true,
    workloadClass: CLASS,
    affinityKey: chatId,
    peers: await listWorkloadPeers(database,),
    matrix: await readAssignmentMatrix(database,),
    assignment,
  },);

  let localRan = false;
  const runLocal = (): Promise<GenerateResponse> => {
    localRan = true;
    return local();
  };

  if (decision.target === "local") { return runLocal(); }

  const peer = decision.peer;
  const hostLocal = peer.authMode === PeerAuthMode.HostLocal;
  const bearer = hostLocal
    ? await readPeerWorkloadToken(database, {
      origin: peer.origin,
      encryptionKey: config.byoKey?.encryptionKey ?? "",
    },)
    : null;

  // Fail closed: a host-local peer with no stored credential cannot be called,
  // and attempting it would spend the one remote attempt on a certain 401.
  if (hostLocal && bearer === null) { return runLocal(); }

  log?.info("chat workload offloaded to peer", {
    attemptId,
    origin: peer.origin,
    reason: decision.reason,
    messages: options.messages.length,
  },);

  const messages: PeerWorkMessage[] = new Array(options.messages.length,);
  for (let index = 0; index < options.messages.length; index += 1) {
    const message = options.messages[index]!;
    messages[index] = { role: message.role, content: message.content, };
  }

  const request: PeerWorkRunRequest = {
    workloadClass: CLASS,
    assignmentKey: decision.assignmentKey,
    provider: options.providerName,
    model: options.modelId,
    messages,
    params: {
      ...(options.temperature === undefined ? {} : { temperature: options.temperature, }),
      ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens, }),
    },
  };

  const response = await dispatchPeerWorkload({
    callerOrigin: publicOriginOf(config.server,),
    decision,
    request,
    local: runLocal,
    bearer,
    ...(options.signal === undefined ? {} : { signal: options.signal, }),
    ...(options.onChunk === undefined ? {} : { onChunk: options.onChunk, }),
    ...(options.runPeer === undefined ? {} : { runPeer: options.runPeer, }),
  },);

  if (localRan) {
    log?.warn("chat workload fell back to local after peer failure", { attemptId, origin: peer.origin, },);
    return response;
  }

  const previous = assignment?.peerOrigin;
  const exclusion = decision.excluded.find((entry,) => entry.origin === previous);
  const releaseReason: WorkReleaseReason = exclusion?.reason === "circuit-open"
    ? "circuit-open"
    : exclusion?.reason === "not-in-matrix"
    ? "matrix-changed"
    : "peer-ineligible";

  void pinWorkloadPeer(database, {
    affinityKey: chatId,
    workloadClass: CLASS,
    peerOrigin: peer.origin,
    ...(previous === undefined || previous === peer.origin
      ? {}
      : { replaces: { previousOrigin: previous, reason: releaseReason, }, }),
  },).catch((error: unknown,) => {
    log?.warn("chat workload assignment pin failed", {
      attemptId,
      error: error instanceof Error ? error.message : "unknown",
    },);
  },);

  return response;
}
