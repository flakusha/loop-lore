/**
 * /quest — Manage quests for the current chat/world.
 *
 * Subcommands:
 *   /quest list       — List active quests
 *   /quest create     — Create a quest from description
 *   /quest status     — Show quest status
 *   /quest complete   — Mark a quest as complete
 */

import { QuestStatus, QuestType, } from "../../db/enums-story";
import { uid, } from "../../utils";
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("quest", async (args, ctx,): Promise<CommandResult> => {
  const action = (args[0] || "list").toLowerCase();
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Quest unavailable:** command context missing database.", handled: true, };
  }

  // Resolve world from the active chat (chat.world_id), not the chat type
  const worldId = ctx.activeChat?.worldId ?? "default";

  switch (action) {
    case "list": {
      const quests = await db
        .selectFrom("quests",)
        .where("world_id", "=", worldId,)
        .where("status", "=", QuestStatus.Active,)
        .orderBy("priority", "desc",)
        .select(["id", "name", "description", "progress", "target",],)
        .execute();

      if (quests.length === 0) {
        return {
          systemMessage: "**Active Quests:**\n\nNo active quests in this world.",
          handled: true,
        };
      }

      const questList = quests
        .map((q,) => {
          const progress = q.target > 0 ? ` (${q.progress}/${q.target})` : "";
          const desc = q.description ? `\n  ${q.description.slice(0, 100,)}` : "";
          return `- **${q.name}**${progress}${desc}`;
        },)
        .join("\n",);

      return {
        systemMessage: `**Active Quests (${quests.length}):**\n\n${questList}`,
        action: "list-quests",
        actionPayload: { quests, },
        handled: true,
      };
    }

    case "create": {
      const description = args.slice(1,).join(" ",).trim();
      if (!description) {
        return {
          systemMessage:
            "Usage: /quest create <description>\nExample: /quest create Find the lost artifact in the crypt",
          handled: true,
        };
      }

      const id = uid();
      await db
        .insertInto("quests",)
        .values({
          id,
          world_id: worldId,
          creator_id: ctx.userId ?? "",
          name: description.slice(0, 100,),
          description,
          type: QuestType.Discovery,
          status: QuestStatus.Active,
          priority: 50,
          config: "{}",
          progress: 0,
          target: 1,
          rewards: "[]",
          narrative_hooks: "[]",
        },)
        .execute();

      return {
        systemMessage: `**Quest created:** ${description.slice(0, 100,)}\n\nThe quest has been added to your journal.`,
        action: "create-quest",
        actionPayload: { id, description, },
        handled: true,
      };
    }

    case "status": {
      const questName = args.slice(1,).join(" ",).trim();
      if (!questName) {
        return {
          systemMessage: "Usage: /quest status <quest name>",
          handled: true,
        };
      }

      const quest = await db
        .selectFrom("quests",)
        .where("world_id", "=", worldId,)
        .where("name", "like", `%${questName}%`,)
        .select(["id", "name", "description", "status", "progress", "target",],)
        .executeTakeFirst();

      if (!quest) {
        return {
          systemMessage: `Quest not found: ${questName}`,
          handled: true,
        };
      }

      const progress = quest.target > 0
        ? `\nProgress: ${quest.progress}/${quest.target} (${Math.round(quest.progress / quest.target * 100,)}%)`
        : "";

      return {
        systemMessage: `**Quest Status:** ${quest.name}\n\nStatus: ${quest.status}${progress}\n\n${
          quest.description ?? "No description."
        }`,
        action: "quest-status",
        actionPayload: { quest, },
        handled: true,
      };
    }

    case "complete": {
      const questName = args.slice(1,).join(" ",).trim();
      if (!questName) {
        return {
          systemMessage: "Usage: /quest complete <quest name>",
          handled: true,
        };
      }

      const quest = await db
        .selectFrom("quests",)
        .where("world_id", "=", worldId,)
        .where("name", "like", `%${questName}%`,)
        .where("status", "=", QuestStatus.Active,)
        .select(["id", "name",],)
        .executeTakeFirst();

      if (!quest) {
        return {
          systemMessage: `Active quest not found: ${questName}`,
          handled: true,
        };
      }

      await db
        .updateTable("quests",)
        .set({
          status: QuestStatus.Completed,
          progress: 1,
          target: 1,
          completed_at: new Date().toISOString(),
        },)
        .where("id", "=", quest.id,)
        .execute();

      return {
        systemMessage: `**Quest completed:** ${quest.name}`,
        action: "complete-quest",
        actionPayload: { id: quest.id, name: quest.name, },
        handled: true,
      };
    }

    default: {
      return {
        systemMessage: "Usage: /quest [list|create|status|complete] [args...]\n\n" +
          "- /quest list — List active quests\n" +
          "- /quest create <desc> — Create a new quest\n" +
          "- /quest status <name> — Show quest progress\n" +
          "- /quest complete <name> — Mark quest as complete",
        handled: true,
      };
    }
  }
},);
