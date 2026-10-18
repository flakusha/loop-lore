// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `POST /api/peer-work/run` — the receiver half of the peer workload wire
 * (TASK-federation-peer-workload-wire-endpoints). Mounted by `federationRoutes`
 * only when `config.federation.enabled`, so a disabled instance answers 404
 * exactly like the mesh routes beside it.
 *
 * Two things make this endpoint safe to expose, and both are structural rather
 * than conventional:
 *
 *   1. The whole trust chain (./peer-work-auth) runs BEFORE the executor is
 *      called, so an unauthorized peer never reaches a provider at all.
 *   2. The response status is decided before the first chunk is written. Once
 *      bytes are on the wire the status is fixed, so a failure after streaming
 *      started cannot be reported as a 4xx/5xx — it becomes a terminal `error`
 *      chunk and the sender treats the attempt as failed. That is what lets an
 *      abort-before-output answer 499.
 */
import type { Elysia, } from "elysia";
import { isPeerWorkloadClass, } from "../federation/peer-capabilities";
import { authorizePeerWork, } from "../federation/peer-work-auth";
import { type PeerWorkExecutor, } from "../federation/peer-work-execute";
import {
  encodePeerWorkChunk,
  parsePeerWorkRunRequest,
  PEER_ORIGIN_HEADER,
  PEER_WORK_RUN_PATH,
  PEER_WORK_STREAM_TYPE,
  PeerWorkErrorCode,
  type PeerWorkRunRequest,
} from "../federation/peer-work-wire";
import { getChildLogger, } from "../logger";
import { type MeshRouteOpts, } from "./federation-mesh";
import { API_META, type ErrorCode, HttpStatus, type HttpStatusCode, } from "./http-utils";

/** 499 is a non-standard "client closed request"; no constant exists for it. */
const HTTP_CLIENT_CLOSED = 499;

export interface PeerWorkRouteOpts extends MeshRouteOpts {
  /** `config.byoKey.encryptionKey` — decrypts per-peer shared credentials. */
  encryptionKey: string;
  /** Runs one admitted workload against the local provider chain. */
  runWorkload: PeerWorkExecutor;
}

/** Envelope `code` for each namespaced rejection, so clients read both. */
const ENVELOPE_CODE: Record<PeerWorkErrorCode, ErrorCode> = {
  [PeerWorkErrorCode.NotConfigured]: "SERVICE_UNAVAILABLE",
  [PeerWorkErrorCode.InvalidOrigin]: "BAD_REQUEST",
  [PeerWorkErrorCode.PeerUntrusted]: "FORBIDDEN",
  [PeerWorkErrorCode.WorkloadTrustRequired]: "FORBIDDEN",
  [PeerWorkErrorCode.ClassNotAllowed]: "FORBIDDEN",
  [PeerWorkErrorCode.CredentialRejected]: "FORBIDDEN",
  [PeerWorkErrorCode.InvalidRequest]: "BAD_REQUEST",
  [PeerWorkErrorCode.Failed]: "SERVER_ERROR",
  [PeerWorkErrorCode.Cancelled]: "SERVER_ERROR",
};

/** A rejection, ready to serialize. */
interface PeerWorkRejection {
  status: HttpStatusCode | number;
  errorCode: PeerWorkErrorCode;
  message: string;
}

/**
 * Serialize a rejection in the existing error envelope, with the namespaced
 * `error_code` in `data` for the calling peer to route on. Never echoes the
 * value that failed.
 * @param rejection
 * @returns {Response}
 */
function peerWorkRejectionResponse(rejection: PeerWorkRejection,): Response {
  return Response.json(
    {
      error: rejection.message,
      code: ENVELOPE_CODE[rejection.errorCode],
      meta: API_META,
      data: { error_code: rejection.errorCode, },
    },
    { status: rejection.status, },
  );
}

/**
 * Extract the bearer credential every workload-trusted peer must present.
 * Returns null for a missing or non-Bearer header, which the trust chain
 * treats as absent.
 * @param header Raw `Authorization` header value.
 * @returns {string | null}
 */
function readBearerCredential(header: string | null,): string | null {
  const match = header === null ? null : /^Bearer\s+(\S+)$/i.exec(header.trim(),);
  return match?.[1] ?? null;
}

/** Classify an executor failure: an aborted attempt is a cancellation, else 500. */
function classifyExecutorFailure(error: unknown, signal: AbortSignal,): PeerWorkRejection {
  const message = error instanceof Error ? error.message : "peer workload failed";
  if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
    return {
      status: HTTP_CLIENT_CLOSED,
      errorCode: PeerWorkErrorCode.Cancelled,
      message: "peer workload cancelled before any output",
    };
  }

  return { status: HttpStatus.InternalServerError, errorCode: PeerWorkErrorCode.Failed, message, };
}

/** Whether the status line has been committed, or the rejection to send. */
type StreamVerdict = { ok: true } | { ok: false; response: Response };

/**
 * Mount `/api/peer-work/run` on a federation app.
 * @param app Elysia app under construction.
 * @param opts Server config + database + the local executor.
 * @returns {void}
 */
export function mountPeerWorkApi(app: Elysia, opts: PeerWorkRouteOpts,): void {
  const { config, } = opts;
  if (!config.federation.enabled) {
    // Fail closed at the mount: a disabled instance never exposes the endpoint,
    // whatever a caller wires up around it.
    return;
  }

  const encoder = new TextEncoder();

  app.post(PEER_WORK_RUN_PATH, async ({ request, body, },) => {
    const parsed = parsePeerWorkRunRequest(body,);
    if (parsed === null || !isPeerWorkloadClass(parsed.workloadClass,)) {
      return peerWorkRejectionResponse({
        status: HttpStatus.BadRequest,
        errorCode: PeerWorkErrorCode.InvalidRequest,
        message: "invalid peer workload request",
      },);
    }

    const admission = await authorizePeerWork({
      database: opts.database,
      config,
      claimedOrigin: request.headers.get(PEER_ORIGIN_HEADER,),
      bearer: readBearerCredential(request.headers.get("authorization",),),
      workloadClass: parsed.workloadClass,
      encryptionKey: opts.encryptionKey,
    },);

    if ("status" in admission) {
      getChildLogger("federation/peer-work",)?.warn("peer workload rejected", {
        errorCode: admission.errorCode,
      },);

      return peerWorkRejectionResponse(admission,);
    }

    // The caller's disconnect becomes the executor's abort, so a dropped peer
    // connection leaves no orphaned generation running here.
    const abort = new AbortController();
    request.signal.addEventListener("abort", () => {
      abort.abort();
    }, { once: true, },);

    return streamPeerWork({ parsed, abort, encoder, executor: opts.runWorkload, },);
  }, {
    detail: {
      summary: "Run a workload class for a trusted federation peer",
      description:
        "Executes one workload class locally on a peer's behalf. Requires a trusted peer with workload trust and the per-peer shared credential. Federation opt-in.",
      tags: ["Federation",],
    },
  },);
}

/**
 * Run the workload and stream its chunks back as ndjson, committing the HTTP
 * status at the first chunk.
 * @param options
 * @param options.parsed The validated wire request.
 * @param options.abort Bridges the caller's disconnect to the executor.
 * @param options.encoder
 * @param options.executor
 * @returns {Promise<Response>}
 */
async function streamPeerWork(options: {
  parsed: PeerWorkRunRequest;
  abort: AbortController;
  encoder: TextEncoder;
  executor: PeerWorkExecutor;
},): Promise<Response> {
  const { parsed, abort, encoder, executor, } = options;
  let settle!: (verdict: StreamVerdict,) => void;
  let streaming = false;
  const verdict = new Promise<StreamVerdict>((resolve,) => {
    settle = resolve;
  },);

  const stream = new ReadableStream<Uint8Array>({
    start: async (streamController,) => {
      const emit = (line: string,): void => {
        if (!streaming) {
          streaming = true;
          settle({ ok: true, },);
        }

        streamController.enqueue(encoder.encode(line,),);
      };

      try {
        await executor.run({
          request: parsed,
          onChunk: (chunk,) => {
            const line = encodePeerWorkChunk(chunk,);
            if (line !== null) { emit(line,); }
          },
          signal: abort.signal,
        },);

        if (!streaming) {
          streaming = true;
          settle({ ok: true, },);
        }

        streamController.close();
      } catch (error) {
        const failure = classifyExecutorFailure(error, abort.signal,);
        if (!streaming) {
          settle({ ok: false, response: peerWorkRejectionResponse(failure,), },);
          return;
        }

        // Bytes are already on the wire: the status can no longer change, so
        // the attempt ends with a terminal error chunk instead.
        streamController.enqueue(encoder.encode(`{"type":"error"}\n`,),);
        streamController.close();
      }
    },
  },);

  const outcome = await verdict;
  if (!outcome.ok) { return outcome.response; }
  return new Response(stream, { headers: { "content-type": PEER_WORK_STREAM_TYPE, }, },);
}
