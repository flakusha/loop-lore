// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /timeline — in-chat world timeline branch management (list/fork/switch).
 *
 * World-scoped: the command resolves the chat's bound world and fails closed
 * when the chat has none (TASK-timeline-in-chat-command error path).
 * Authorization mirrors the timelines routes (src/routes/worlds/timelines.ts):
 *
 *   - list   — `requireWorldAccess` (any viewer of the world)
 *   - fork   — `requireWorldOwner` (branch creation mirrors POST create)
 *   - switch — `requireWorldOwner`: switching moves the SHARED chat
 *              generation branch (`chats.timeline_id`), not a personal view —
 *              the per-user selection lives in POST .../timelines/:id/select.
 *              Subsequent prompt assembly scopes lore injection and timeline
 *              reads to this branch (src/assistant/prompt/sections/lore.ts).
 *
 * Branch creation reuses the world-timeline tooling's fork
 * (`createWhatIfSimulator().fork`), not the HTTP route.
 */

import { requireWorldAccess, requireWorldOwner, } from "../../routes/worlds/access";
import { createWhatIfSimulator, } from "../../story/whatif-simulator";
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("timeline", async (args, ctx,): Promise<CommandResult> => {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Timeline unavailable:** command context missing database.", handled: true, };
  }

  const sub = (args[0] ?? "list").toLowerCase();
  if (!["list", "fork", "switch",].includes(sub,)) {
    return { systemMessage: "Usage: /timeline list | /timeline fork [label] | /timeline switch <id>", handled: true, };
  }

  const chat = await db
    .selectFrom("chats",)
    .select(["world_id", "timeline_id",],)
    .where("id", "=", ctx.chatId,)
    .executeTakeFirst();

  if (!chat?.world_id) {
    return {
      systemMessage: "**Timeline:** this chat has no world bound — timeline branches are world-scoped.",
      handled: true,
    };
  }

  const worldId = chat.world_id;

  const accessErr = await requireWorldAccess(db, worldId, ctx.userId ?? null, ctx.userRole ?? null,);
  if (accessErr) {
    return { systemMessage: "**Timeline:** you do not have access to this chat's world.", handled: true, };
  }

  if (sub === "list") {
    const branches = await db
      .selectFrom("world_timelines",)
      .select(["id", "name", "is_prime",],)
      .where("world_id", "=", worldId,)
      .orderBy("is_prime", "desc",)
      .orderBy("name", "asc",)
      .execute();

    const activeId = chat.timeline_id;
    const lines = branches.map((b,) => {
      const isActive = b.id === activeId || (b.is_prime === 1 && activeId === "prime");
      return `${isActive ? "▸" : " "} ${b.name} — ${b.id}${b.is_prime === 1 ? " (prime)" : ""}`;
    },);

    return {
      systemMessage: `**Timeline branches:**\n${lines.join("\n",) || "(none)"}`,
      handled: true,
      action: "timeline-list",
      actionPayload: { worldId, branches, activeTimelineId: activeId, },
    };
  }

  // fork + switch mutate the world's branch structure — owner only.
  const ownerErr = await requireWorldOwner(db, worldId, ctx.userId ?? null, ctx.userRole ?? null,);
  if (ownerErr) {
    return { systemMessage: "**Timeline:** only the world owner can fork or switch branches.", handled: true, };
  }

  if (sub === "fork") {
    const label = args.slice(1,).join(" ",).trim() || `Fork ${new Date().toISOString().slice(0, 10,)}`;
    const simulator = createWhatIfSimulator({ db, worldId, timelineId: chat.timeline_id ?? "prime", },);
    const forkId = await simulator.fork(label,);
    return {
      systemMessage:
        `**Timeline forked:** "${label}" created (${forkId}). Switch to it with /timeline switch ${forkId}`,
      handled: true,
      action: "timeline-fork",
      actionPayload: { worldId, timelineId: forkId, name: label, },
    };
  }

  // switch
  const targetId = (args[1] ?? "").trim();
  if (!targetId) {
    return { systemMessage: "Usage: /timeline switch <timeline-id>", handled: true, };
  }

  const branch = await db
    .selectFrom("world_timelines",)
    .select(["id", "name", "is_prime",],)
    .where("id", "=", targetId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();

  if (!branch) {
    return { systemMessage: `**Timeline:** unknown timeline id \`${targetId}\` for this world.`, handled: true, };
  }

  // Prime events carry the `prime` slug even though the world_timelines row
  // has a uuid id (same resolution as the world-detail loader).
  const slug = branch.is_prime === 1 ? "prime" : branch.id;
  await db
    .updateTable("chats",)
    .set({ timeline_id: slug, },)
    .where("id", "=", ctx.chatId,)
    .execute();

  return {
    systemMessage: `**Timeline switched:** this chat now generates on "${branch.name}"${
      branch.is_prime === 1 ? " (prime)" : ""
    }.`,
    handled: true,
    action: "timeline-switch",
    actionPayload: { worldId, chatId: ctx.chatId, timelineId: slug, name: branch.name, },
  };
}, { requiredRole: "member", },);
