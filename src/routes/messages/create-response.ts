// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Final-response mapping for POST /chats/:id/messages.
 *
 * Split out of create.ts for the per-file size gate: the handler's job ends
 * once the row is persisted and the auto-reply has been attempted, so how
 * that attempt becomes an HTTP response is its own concern.
 */
import { jsonCreated, } from "../http-utils";

/** The auto-reply attempt, as returned by `maybeAutoReply`. */
export type AutoReplyOutcome = { replied: boolean; response?: Response };

/**
 * Map an auto-reply attempt onto the route's HTTP response.
 *
 * A failed generation (e.g. assistant swipe retries exhausted) surfaces as a
 * non-2xx jsonError Response. Propagate it verbatim instead of re-wrapping it
 * into a 201 whose body lacks the declared id
 * (BUG-message-create-re-wraps-a-503-reply-into-201-jsoncreated).
 * @param reply
 * @param id
 * @param context
 */
export async function createResponse(
  reply: AutoReplyOutcome,
  id: string,
  context: unknown,
): Promise<Response> {
  if (reply.replied) {
    const generation = reply.response;
    if (generation && (generation.status < 200 || generation.status >= 300)) {
      const errorBody = (await generation.json()) as Record<string, unknown>;

      return Response.json(
        { ...errorBody, id, context, },
        { status: generation.status, headers: generation.headers, },
      );
    }

    return jsonCreated({ ...(await generation?.json?.()), context, },);
  }

  return jsonCreated({ id, context, },);
}
