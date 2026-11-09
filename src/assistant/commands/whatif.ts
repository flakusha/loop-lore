// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /whatif — simulate hypothetical outcome beats on the chat's timeline branch.
 *
 * World-scoped like /timeline: resolves the chat's bound world and fails
 * closed when the chat has none. Read-only — `simulateForkFor` persists
 * nothing — so authorization is `requireWorldAccess` (any viewer of the
 * world), mirroring the timeline list path.
 *
 * When the chat already generates on a non-prime branch, the summary
 * additionally includes a `diffBranches` divergence summary against prime.
 */

import { requireWorldAccess, } from "../../routes/worlds/access";
import { createWhatIfSimulator, } from "../../story/whatif-simulator";
import { type CommandResult, registerCommand, } from "./registry";

const DEFAULT_BEATS = 3;
const MAX_BEATS = 10;

/**
 * Split args into (hypothetical, beat count). parseCommand has no quote
 * grouping, so a free-text hypothetical is the args joined with spaces and
 * an optional TRAILING integer is the beat count: `/whatif the dragon wins 5`.
 */
function splitHypotheticalArgs(args: string[],): { hypothetical: string; beatCount: number } {
  const last = args[args.length - 1] ?? "";
  const hasCount = args.length > 1 && /^[1-9]\d*$/.test(last,);
  const beatCount = hasCount
    ? Math.min(Number.parseInt(last, 10,), MAX_BEATS,)
    : DEFAULT_BEATS;

  const hypothetical = (hasCount ? args.slice(0, -1,) : args).join(" ",).trim();
  return { hypothetical, beatCount, };
}

registerCommand("whatif", async (args, ctx,): Promise<CommandResult> => {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**What-if unavailable:** command context missing database.", handled: true, };
  }

  const { hypothetical, beatCount, } = splitHypotheticalArgs(args,);
  if (!hypothetical) {
    return { systemMessage: "Usage: /whatif <hypothetical> [beats]", handled: true, };
  }

  const chat = await db
    .selectFrom("chats",)
    .select(["world_id", "timeline_id",],)
    .where("id", "=", ctx.chatId,)
    .executeTakeFirst();

  if (!chat?.world_id) {
    return {
      systemMessage: "**What-if:** this chat has no world bound — timeline simulation is world-scoped.",
      handled: true,
    };
  }

  const worldId = chat.world_id;

  const accessErr = await requireWorldAccess(db, worldId, ctx.userId ?? null, ctx.userRole ?? null,);
  if (accessErr) {
    return { systemMessage: "**What-if:** you do not have access to this chat's world.", handled: true, };
  }

  const timelineId = chat.timeline_id ?? "prime";
  const simulator = createWhatIfSimulator({ db, worldId, timelineId, },);
  const beats = await simulator.simulateForkFor(hypothetical, timelineId, beatCount,);

  const lines = beats.map((b,) => `▸ ${b.description}`);

  // Divergence summary: only meaningful when the chat sits on a fork of prime.
  let diff: { onlyInA: number; onlyInB: number; shared: number } | undefined;
  if (timelineId !== "prime") {
    const branchDiff = await simulator.diffBranches("prime", timelineId,);
    diff = {
      onlyInA: branchDiff.onlyInA.length,
      onlyInB: branchDiff.onlyInB.length,
      shared: branchDiff.shared.length,
    };

    lines.push(
      "",
      `**Branch divergence vs prime:** ${diff.onlyInA} prime-only · ${diff.onlyInB} branch-only · ${diff.shared} shared`,
    );
  }

  return {
    systemMessage: `**What-if:** "${hypothetical}"\n${lines.join("\n",) || "(no beats simulated)"}`,
    handled: true,
    action: "whatif",
    actionPayload: { worldId, timelineId, hypothetical, beats, diff, },
  };
}, { requiredRole: "member", capabilities: ["read-world",], },);
