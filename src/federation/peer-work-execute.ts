// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Receiver-side workload execution (TASK-federation-peer-workload-wire-endpoints).
 *
 * The peer does NOT send a provider to obey — it sends the provider *profile* it
 * wants the class served by, and this instance resolves it against its OWN
 * registry through `buildFailoverList`. Provider failover therefore stays
 * entirely inside the hop that owns providers: the sender's chain never sees a
 * remote provider, and the receiver's chain never sees the sender's.
 *
 * That is the whole reason a peer is not an `LLMProvider` on the calling side:
 * a peer failure here trips this instance's local vendor breaker, which is the
 * behaviour the epic forbids on the OTHER side of the wire.
 */
import { type Config, } from "../config/schema";
import { buildFailoverList, } from "../generation/providers/registry";
import { type ChunkEvent, type GenerateResponse, } from "../generation/providers/types";
import { scheduledCallWithFailover, } from "../generation/scheduler";
import { type PeerWorkRunRequest, } from "./peer-work-wire";

/**
 * Runs one admitted workload. Injected so a test drives the wire without an LLM,
 * and so the quota slice can wrap admission without touching the route.
 */
export interface PeerWorkExecutor {
  run(options: {
    request: PeerWorkRunRequest;
    /** Called once per streamed chunk, in generation order. */
    onChunk: (chunk: ChunkEvent,) => void;
    /** Aborts when the caller disconnects or the per-attempt budget expires. */
    signal: AbortSignal;
  },): Promise<GenerateResponse>;
}

/**
 * The production executor: resolve the requested provider profile locally and
 * run the normal scheduled failover chain behind it.
 * @param options
 * @param options.config
 * @returns {PeerWorkExecutor}
 */
export function createLocalPeerWorkExecutor(options: { config: Config },): PeerWorkExecutor {
  const { config, } = options;

  return {
    run: ({ request, onChunk, signal, },) => {
      const failoverList = buildFailoverList(request.provider, config,);
      if (failoverList.length === 0) {
        return Promise.reject(
          new Error(`peer workload: no local provider resolved for "${request.provider}"`,),
        );
      }

      // Unique per attempt: the scheduler rejects live duplicate ids, and two
      // peers may legitimately ask for the same class at the same moment.
      const id = `peer-work:${request.assignmentKey}:${Date.now().toString(36,)}`;
      return scheduledCallWithFailover({
        id,
        failoverList,
        req: {
          model: request.model,
          messages: request.messages,
          params: {
            ...(request.params?.temperature === undefined ? {} : { temperature: request.params.temperature, }),
            ...(request.params?.maxTokens === undefined ? {} : { maxTokens: request.params.maxTokens, }),
          },
          signal,
        },
        handler: onChunk,
      },);
    },
  };
}
