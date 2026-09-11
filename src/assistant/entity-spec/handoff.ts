// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Creation-chat handoff for story-triggered entity generation
 * (FEAT-in-story-character-generation-via-assistant-chat-handoff).
 *
 * Chosen approach over a shadow flow / subchat: reroute to a NEW assistant
 * chat seeded with the entity information gathered from the story. The
 * creation chat is private and owned by the requesting user (the GM side is
 * the assistant role — replies post under the caller's actor id); access is
 * gated on membership of the source chat. It is
 * linked to the source chat via parent_chat_id for traceability. The final
 * spec still flows through the existing generate -> quality gates ->
 * create-entity-preview -> confirm persistence chain, so nothing becomes a
 * full game asset without user approval.
 */

import type { Kysely, } from "kysely";
import { createChat, } from "../../chat/service";
import type { AssistantWorkflowConfig, } from "../../config/sections/templates";
import { MessageRole, } from "../../db/enums-core/messages";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import { startSession, type WorkflowSession, } from "../workflow-session";
import { saveSession, } from "../workflow-session-store";
import {
  creationChatTitle,
  type EntitySpecDescriptor,
  findEntitySpec,
  firstSeedLine,
} from "./entity-spec-kinds";

/** Result of a successful handoff. */
export interface EntityCreationHandoff {
  /** New creation chat (private, requester-owned). */
  chatId: string;
  descriptor: EntitySpecDescriptor;
  /** Resolved workflow template driving the creation chat. */
  workflow: AssistantWorkflowConfig;
}

export type HandoffError =
  | { ok: false; code: "unknown_kind"; message: string }
  | { ok: false; code: "unknown_workflow"; message: string }
  | { ok: false; code: "chat_create_failed"; message: string };

/** Inputs for {@link handoffToEntityCreationChat}; all ids untrusted. */
export interface HandoffOptions {
  kind: string;
  /** Entity information gathered from the story (description, name hints). */
  seed: string;
  /** Chat the story introduction happened in (linked as parent). */
  sourceChatId: string;
  /** Actor id of the requesting user (chat owner of the creation chat).
   *  The GM side is the assistant itself — assistant/GM replies post under
   *  the caller's actor id, so there is no separate GM actor row. */
  userId: string;
  /** Loaded workflow templates (values of config.templates.workflows). */
  workflows: readonly AssistantWorkflowConfig[];
}

/**
 * Create the restricted creation chat, seed it with the story context, and
 * start (memory + DB) the kind's workflow session in it.
 *
 * @throws never — failures come back as {@link HandoffError}
 */
export async function handoffToEntityCreationChat(
  db: Kysely<DB>,
  opts: HandoffOptions,
): Promise<HandoffError | { ok: true; value: EntityCreationHandoff }> {
  const descriptor = findEntitySpec(opts.kind,);
  if (descriptor === undefined) {
    return { ok: false, code: "unknown_kind", message: `Unknown entity kind: ${opts.kind}`, };
  }
  const workflow = opts.workflows.find((w,) => w.id === descriptor.workflowId);
  if (workflow === undefined) {
    return {
      ok: false,
      code: "unknown_workflow",
      message: `Workflow template not loaded: ${descriptor.workflowId}`,
    };
  }

  const seedName = firstSeedLine(opts.seed,);
  let chatId: string;
  try {
    chatId = await createChat(db, {
      name: creationChatTitle(descriptor, seedName,),
      type: "direct",
      mode: "direct",
      createdBy: opts.userId,
      participantIds: [],
      parentChatId: opts.sourceChatId,
      visibility: "private",
    },);
  } catch (error) {
    return {
      ok: false,
      code: "chat_create_failed",
      message: error instanceof Error ? error.message : "Creation chat failed.",
    };
  }

  // Seed message: the story context the finalize steps build on. System
  // voice so it never reads as a participant turn.
  await db
    .insertInto("messages",)
    .values({
      id: uid(),
      chat_id: chatId,
      actor_id: opts.userId,
      role: MessageRole.System,
      content: seedMessage(descriptor.kind, opts.seed,),
    },)
    .execute();

  // Start the guided workflow run in the new chat (memory + write-through).
  const session: WorkflowSession = startSession(chatId, workflow,);
  await saveSession(db, chatId, session,);

  return { ok: true, value: { chatId, descriptor, workflow, }, };
}

/** Render the seeded system message body. */
function seedMessage(kind: string, seed: string,): string {
  return [
    `In-place ${kind} generation (story handoff).`,
    "Entity information gathered from the story so far:",
    seed.trim(),
    "",
    "Finalize the spec here; persistence stays gated behind review/approval.",
  ].join("\n",);
}
