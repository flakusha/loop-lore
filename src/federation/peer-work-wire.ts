// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The peer workload WIRE CONTRACT (TASK-federation-peer-workload-wire-endpoints).
 *
 * One module, both directions: the receiver route imports the request shape,
 * the sender client imports the same shapes plus the chunk codec. There is no
 * second definition of the payload for either side to drift from.
 *
 * Data minimization is a property of these types, not a convention: a
 * `PeerWorkRunRequest` has exactly the fields a workload needs — the class, an
 * opaque assignment handle, the provider/model to resolve locally, the prompt
 * plus its minimal context slice, and generation params. There is no field for
 * a chat id, a user id, a session cookie, or any other chat, so none can leak.
 * The role vocabulary is the generation one, so a peer cannot smuggle an
 * arbitrary role string past the boundary either.
 *
 * Rejections carry a namespaced `error_code` a peer routes on, serialized in
 * the existing envelope's `data` payload (`jsonError({ data })`). The strings
 * deliberately avoid the words in the leak-test regex, so an error body is as
 * clean as a success body.
 */
import { type PeerWorkloadClass, } from "../db/enums";
import { type GenerationMessage, } from "../generation/gen-types-options";
import { type ChunkEvent, type GenerateResponse, } from "../generation/providers/types";
import { jsonParseOr, safeJsonStringify, } from "../utils";

/** Header carrying the calling peer's canonical origin. */
export const PEER_ORIGIN_HEADER = "x-peer-origin";

/** Path of the receiver endpoint on a peer. */
export const PEER_WORK_RUN_PATH = "/api/peer-work/run";

/** Media type of a peer workload response: newline-delimited JSON chunks. */
export const PEER_WORK_STREAM_TYPE = "application/x-ndjson";

/**
 * Namespaced rejection codes. A peer branches on these, never on the human
 * message, which is not part of the contract.
 */
export const PeerWorkErrorCode = {
  NotConfigured: "federation.workload_not_configured",
  InvalidOrigin: "federation.workload_invalid_origin",
  PeerUntrusted: "federation.workload_peer_untrusted",
  WorkloadTrustRequired: "federation.workload_trust_required",
  ClassNotAllowed: "federation.workload_class_not_allowed",
  CredentialRejected: "federation.workload_credential_rejected",
  InvalidRequest: "federation.workload_invalid_request",
  Failed: "federation.workload_failed",
  Cancelled: "federation.workload_cancelled",
} as const;
/** Namespaced rejection code a peer routes on. */
export type PeerWorkErrorCode = (typeof PeerWorkErrorCode)[keyof typeof PeerWorkErrorCode];

/** One turn of the minimal context slice. No ids, no author, no timestamps. */
export interface PeerWorkMessage {
  role: GenerationMessage["role"];
  content: string;
}

/** Generation knobs the sender may set. Anything else stays local. */
export interface PeerWorkParams {
  temperature?: number;
  maxTokens?: number;
}

/** The whole peer-visible request body. Nothing more is accepted. */
export interface PeerWorkRunRequest {
  workloadClass: PeerWorkloadClass;
  /** Opaque handle from `peerAssignmentKey`; never the chat id. */
  assignmentKey: string;
  /** Local provider profile the RECEIVER resolves in its own registry. */
  provider: string;
  model: string;
  messages: PeerWorkMessage[];
  params?: PeerWorkParams;
}

const PEER_WORK_ROLES: readonly GenerationMessage["role"][] = [
  "system",
  "user",
  "assistant",
  "character",
  "tool",
];

/** A `{ role, content }` pair is accepted only with a known role and string content. */
function parseMessage(raw: unknown,): PeerWorkMessage | null {
  if (typeof raw !== "object" || raw === null) { return null; }
  const entry: Record<string, unknown> = raw as Record<string, unknown>;
  const role = PEER_WORK_ROLES.find((candidate,) => candidate === entry.role);
  if (role === undefined || typeof entry.content !== "string") { return null; }
  return { role, content: entry.content, };
}

/**
 * Narrow an untrusted wire body to a `PeerWorkRunRequest`. Anything missing or
 * wrongly typed is rejected rather than coerced — a peer must not be able to
 * smuggle a half-formed request past the boundary.
 * @param raw Parsed request body from the wire.
 * @returns The request, or null when the body is unusable.
 */
export function parsePeerWorkRunRequest(raw: unknown,): PeerWorkRunRequest | null {
  if (typeof raw !== "object" || raw === null) { return null; }
  const body: Record<string, unknown> = raw as Record<string, unknown>;
  if (typeof body.provider !== "string" || typeof body.model !== "string") { return null; }
  if (typeof body.assignmentKey !== "string" || typeof body.workloadClass !== "string") { return null; }
  if (!Array.isArray(body.messages,)) { return null; }

  const messages: PeerWorkMessage[] = [];
  for (const entry of body.messages) {
    const message = parseMessage(entry,);
    if (message === null) { return null; }
    messages.push(message,);
  }

  const rawParams = typeof body.params === "object" && body.params !== null ? body.params : {};
  const params: Record<string, unknown> = rawParams as Record<string, unknown>;
  return {
    workloadClass: body.workloadClass as PeerWorkloadClass,
    assignmentKey: body.assignmentKey,
    provider: body.provider,
    model: body.model,
    messages,
    ...(typeof params.temperature === "number" || typeof params.maxTokens === "number"
      ? {
        params: {
          ...(typeof params.temperature === "number" ? { temperature: params.temperature, } : {}),
          ...(typeof params.maxTokens === "number" ? { maxTokens: params.maxTokens, } : {}),
        },
      }
      : {}),
  };
}

/**
 * Read the namespaced rejection code out of an error envelope. Returns null for
 * a body that carries none, so an unrelated failure is never mistaken for a
 * routable federation rejection.
 * @param raw Parsed error body from the peer.
 * @returns {PeerWorkErrorCode | null}
 */
export function readPeerWorkErrorCode(raw: unknown,): PeerWorkErrorCode | null {
  if (typeof raw !== "object" || raw === null) { return null; }
  const data: unknown = (raw as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) { return null; }
  const code = (data as Record<string, unknown>).error_code;
  return typeof code === "string" ? (code as PeerWorkErrorCode) : null;
}

/** The chunk types this version understands, and no others. */
const PEER_WORK_CHUNK_TYPES: ReadonlySet<string> = new Set([
  "content",
  "thinking",
  "tool_call",
  "tool_result",
  "done",
  "error",
],);

/** One ndjson line (newline included), or null when it cannot be serialized. */
export function encodePeerWorkChunk(chunk: ChunkEvent,): string | null {
  const encoded = safeJsonStringify(chunk,);
  return encoded.ok ? `${encoded.value}\n` : null;
}

/**
 * Decode one ndjson line. A malformed line is a PROTOCOL error, never a
 * silently dropped chunk — a peer that loses a chunk mid-generation would hand
 * the caller a truncated reply that looks complete.
 * @param line One wire line, without the newline.
 * @returns {ChunkEvent | null}
 */
export function parsePeerWorkChunkLine(line: string,): ChunkEvent | null {
  const trimmed = line.trim();
  if (trimmed === "") { return null; }
  const parsed: unknown = jsonParseOr(trimmed, null,);
  if (typeof parsed !== "object" || parsed === null) { return null; }
  const type = (parsed as Record<string, unknown>).type;
  // A known type only: an unrecognised chunk from a newer or hostile peer must
  // not flow into the assembler as if it were content.
  return PEER_WORK_CHUNK_TYPES.has(type as string,) ? (parsed as ChunkEvent) : null;
}

/**
 * Reassemble streamed chunks into one response, in arrival order. Returns null
 * unless a `done` chunk closed the stream — an unterminated stream is a failed
 * attempt, not a short answer.
 * @param chunks Chunks in wire order.
 * @returns {GenerateResponse | null}
 */
export function assemblePeerWorkChunks(chunks: readonly ChunkEvent[],): GenerateResponse | null {
  let content = "";
  let thinking = "";
  let finishReason: GenerateResponse["finishReason"] = "stop";
  let usage: GenerateResponse["usage"] | undefined;
  let terminated = false;

  for (const chunk of chunks) {
    if (chunk.type === "content") { content += chunk.content ?? ""; }
    if (chunk.type === "thinking") { thinking += chunk.content ?? ""; }
    if (chunk.type !== "done") { continue; }
    terminated = true;
    if (chunk.finishReason !== undefined) { finishReason = chunk.finishReason as GenerateResponse["finishReason"]; }
    if (chunk.usage !== undefined) { usage = chunk.usage; }
  }

  if (!terminated || usage === undefined) { return null; }
  return { content, ...(thinking === "" ? {} : { thinking, }), finishReason, usage, };
}
