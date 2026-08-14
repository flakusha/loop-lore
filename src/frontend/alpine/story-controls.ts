/**
 * Story Controls — client for story-orchestration endpoints.
 *
 * Spec-conformant actions per docs/frontend/chat/multi-llm-story.md:
 *   POST /api/chats/:id/story/pause|resume|step
 *   POST /api/chats/:id/gm/escalate
 *   POST /api/chats/:id/story/narration  (inject narration)
 *
 * The story-engine backend (LLM role wiring workstream) owns these routes.
 * Until they land, every call resolves to a graceful `{ ok: false }` so the UI
 * can surface a pending-wiring notice instead of an unhandled error.
 */

import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "story-controls", },);

/** Story-orchestration action identifiers (spec § API endpoints). */
export type StoryControlAction =
  | "pause"
  | "resume"
  | "step"
  | "escalate"
  | "narration";

/** Result of a story-control call. `ok: false` → show `message` to the user. */
export interface StoryControlResult {
  ok: boolean;
  message?: string;
}

/** True while a control request is in flight (prevents double-clicks). */
const inFlight = new Set<string>();

/**
 * Dispatch a story-orchestration action to the story-engine backend.
 *
 * @param chatId — active chat id
 * @param action — orchestration action (pause/resume/step/escalate/narration)
 * @param body — optional payload (e.g. narration text)
 * @returns { ok, message } — ok=false carries a user-facing failure reason
 * @example await storyControl(chatId, "step")
 */
export async function storyControl(
  chatId: string,
  action: StoryControlAction,
  body?: unknown,
): Promise<StoryControlResult> {
  if (inFlight.has(action)) { return { ok: false, message: "story control busy", }; }
  inFlight.add(action,);
  try {
    const res = await apiFetch(`/api/chats/${chatId}/story/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: body !== undefined ? jsonBody(body,) : undefined,
    },);
    if (res.ok) { return { ok: true, }; }
    const data = await res.json().catch(() => null) as { message?: string } | null;
    return { ok: false, message: data?.message ?? `story control "${action}" failed (${res.status})`, };
  } catch (error) {
    log.warn("Story control request failed", { action, error, },);
    return { ok: false, message: `story control "${action}" unavailable`, };
  } finally {
    inFlight.delete(action,);
  }
}
