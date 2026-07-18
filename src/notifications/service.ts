// src/notifications/service.ts
//
// Per-user notification service. Backs the in-app bell/dropdown, the
// notification preferences (stored in `users.settings.notifications`), and
// the LLM prompt-injection "Recent Events" feed.
//
// Triggers (mention, chat invite, quest update, GM action, system) call the
// exported `notify*` helpers, which fire-and-forget via `NotificationService.emit`
// so a notification failure never breaks the primary request.

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { NotificationType } from "../db/enums-core";
import { uid, jsonParseOr, safeJsonStringify } from "../utils";
import { getLogger } from "../logger";

export { NotificationType } from "../db/enums-core";

/** A single notification as returned to clients. */
export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: number;
  data: string | null;
  createdAt: string;
}

/** Per-user notification preferences. */
export interface NotificationPreferences {
  enabled: Record<NotificationType, boolean>;
  mutedWorlds: string[];
}

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: {
    [NotificationType.Mention]: true,
    [NotificationType.QuestUpdate]: true,
    [NotificationType.ItemOffer]: true,
    [NotificationType.WorldEvent]: false,
    [NotificationType.ChatInvite]: true,
    [NotificationType.CharacterUpdate]: false,
    [NotificationType.GmAction]: true,
    [NotificationType.System]: true,
  },
  mutedWorlds: [],
};

/** Input for creating one notification. */
export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
  /** When set, a user who muted this world will not receive the notification. */
  worldId?: string;
}

function mergePrefs(stored?: Partial<NotificationPreferences>): NotificationPreferences {
  const prefs: NotificationPreferences = {
    enabled: { ...DEFAULT_PREFS.enabled },
    mutedWorlds: [...DEFAULT_PREFS.mutedWorlds],
  };
  if (stored?.enabled) {
    for (const key of Object.keys(prefs.enabled) as NotificationType[]) {
      const value = stored.enabled[key];
      if (typeof value === "boolean") prefs.enabled[key] = value;
    }
  }
  if (Array.isArray(stored?.mutedWorlds)) {
    prefs.mutedWorlds = [...stored.mutedWorlds];
  }
  return prefs;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: number;
  data: string | null;
  created_at: string;
}

function mapRow(r: NotificationRow): NotificationRecord {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    read: r.read,
    data: r.data,
    createdAt: r.created_at,
  };
}

async function participantActorIds(db: Kysely<DB>, chatId: string): Promise<string[]> {
  const rows = await db
    .selectFrom("chat_participants")
    .select("actor_id")
    .where("chat_id", "=", chatId)
    .execute();
  return rows.map((r) => r.actor_id);
}

async function worldParticipantActorIds(db: Kysely<DB>, worldId: string): Promise<string[]> {
  const rows = await db
    .selectFrom("chat_participants")
    .select("chat_participants.actor_id")
    .innerJoin("chats", "chats.id", "chat_participants.chat_id")
    .where("chats.world_id", "=", worldId)
    .execute();
  return [...new Set(rows.map((r) => r.actor_id))];
}

export class NotificationService {
  private readonly log = getLogger().child({ module: "notifications" });

  constructor(private readonly db: Kysely<DB>) {}

  /** Read the user's notification preferences, merging over defaults. */
  async getPrefs(userId: string): Promise<NotificationPreferences> {
    const user = await this.db
      .selectFrom("users")
      .select("settings")
      .where("id", "=", userId)
      .executeTakeFirst();
    const settings = jsonParseOr(user?.settings ?? "{}", {}) as Record<string, unknown>;
    const stored = settings.notifications as Partial<NotificationPreferences> | undefined;
    return mergePrefs(stored);
  }

  /** Merge and persist the user's notification preferences. */
  async setPrefs(
    userId: string,
    patch: { enabled?: Partial<Record<NotificationType, boolean>>; mutedWorlds?: string[] },
  ): Promise<NotificationPreferences> {
    const current = await this.getPrefs(userId);
    const merged: NotificationPreferences = {
      enabled: { ...current.enabled, ...patch.enabled },
      mutedWorlds: patch.mutedWorlds ?? current.mutedWorlds,
    };

    const user = await this.db
      .selectFrom("users")
      .select("settings")
      .where("id", "=", userId)
      .executeTakeFirst();
    const settings = jsonParseOr(user?.settings ?? "{}", {}) as Record<string, unknown>;
    settings.notifications = merged;

    const serialized = safeJsonStringify(settings);
    if (serialized.ok) {
      await this.db
        .updateTable("users")
        .set({ settings: serialized.value })
        .where("id", "=", userId)
        .execute();
    }
    return merged;
  }

  /**
   * Create a notification, skipping when the type is disabled for the user or
   * when the linked world is muted.
   */
  async create(input: NotificationInput): Promise<void> {
    const prefs = await this.getPrefs(input.userId);
    if (!prefs.enabled[input.type]) return;
    if (input.worldId && prefs.mutedWorlds.includes(input.worldId)) return;

    const data = input.data ? safeJsonStringify(input.data) : null;
    await this.db
      .insertInto("notifications")
      .values({
        id: uid(),
        user_id: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        read: 0,
        data: data?.ok ? data.value : null,
        created_at: new Date().toISOString(),
      })
      .execute();
  }

  /** Fire-and-forget variant: logs and drops on failure. */
  emit(input: NotificationInput): void {
    void this.create(input).catch((error) => {
      this.log.warn(
        "Failed to create notification",
        error instanceof Error ? { error: error.message } : undefined,
      );
    });
  }

  /** Newest-first list, optionally unread only. */
  async list(userId: string, unreadOnly = false): Promise<NotificationRecord[]> {
    let query = this.db.selectFrom("notifications").selectAll().where("user_id", "=", userId);
    if (unreadOnly) query = query.where("read", "=", 0);
    const rows = await query.orderBy("created_at", "desc").limit(50).execute();
    return rows.map((row) => mapRow(row));
  }

  /** Count of unread notifications for a user. */
  async getUnreadCount(userId: string): Promise<number> {
    const row = await this.db
      .selectFrom("notifications")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("user_id", "=", userId)
      .where("read", "=", 0)
      .executeTakeFirst();
    return row?.count ?? 0;
  }

  /** Mark a single notification read (ownership-checked). */
  async markRead(id: string, userId: string): Promise<void> {
    await this.db
      .updateTable("notifications")
      .set({ read: 1 })
      .where("id", "=", id)
      .where("user_id", "=", userId)
      .execute();
  }

  /** Mark every notification read for a user. */
  async markAllRead(userId: string): Promise<void> {
    await this.db
      .updateTable("notifications")
      .set({ read: 1 })
      .where("user_id", "=", userId)
      .where("read", "=", 0)
      .execute();
  }

  /** Delete a notification (ownership-checked). */
  async delete(id: string, userId: string): Promise<void> {
    await this.db.deleteFrom("notifications").where("id", "=", id).where("user_id", "=", userId).execute();
  }

  /**
   * Build the `[Recent Events]` block injected into the LLM prompt so
   * characters stay aware of off-screen activity. Returns "" when empty.
   */
  async buildRecentEventsContext(userId: string, chatId?: string): Promise<string> {
    let query = this.db.selectFrom("notifications").selectAll().where("user_id", "=", userId);
    if (chatId) query = query.where("link", "like", `%${chatId}%`);
    const rows = await query.orderBy("created_at", "desc").limit(5).execute();
    if (rows.length === 0) return "";
    const lines = rows.map((r) => {
      const bodyPart = r.body ? `: ${r.body}` : "";
      return `- ${r.title}${bodyPart}`;
    });
    return `[Recent Events]\n${lines.join("\n")}`;
  }
}

// ── Trigger helpers (fire-and-forget) ───────────────────────────────────

export async function notifyMention(
  db: Kysely<DB>,
  opts: { chatId: string; senderId: string; mentionedActorIds: string[]; messageId: string },
): Promise<void> {
  if (opts.mentionedActorIds.length === 0) return;
  const [chat, sender] = await Promise.all([
    db.selectFrom("chats").select("name").where("id", "=", opts.chatId).executeTakeFirst(),
    db.selectFrom("actors").select("display_name").where("id", "=", opts.senderId).executeTakeFirst(),
  ]);
  const senderName = sender?.display_name ?? "Someone";
  const chatName = chat?.name ?? "a chat";
  const svc = new NotificationService(db);
  for (const actorId of opts.mentionedActorIds) {
    if (actorId === opts.senderId) continue;
    await svc.create({
      userId: actorId,
      type: NotificationType.Mention,
      title: `${senderName} mentioned you`,
      body: `in "${chatName}"`,
      link: `/chat/${opts.chatId}`,
      data: { messageId: opts.messageId, chatId: opts.chatId },
    });
  }
}

export async function notifyChatInvite(
  db: Kysely<DB>,
  opts: { chatId: string; invitedUserId: string; inviterId: string },
): Promise<void> {
  const [chat, inviter] = await Promise.all([
    db.selectFrom("chats").select("name").where("id", "=", opts.chatId).executeTakeFirst(),
    db.selectFrom("actors").select("display_name").where("id", "=", opts.inviterId).executeTakeFirst(),
  ]);
  const inviterName = inviter?.display_name ?? "Someone";
  const chatName = chat?.name ?? "a group chat";
  await new NotificationService(db).create({
    userId: opts.invitedUserId,
    type: NotificationType.ChatInvite,
    title: `Invited to "${chatName}"`,
    body: `${inviterName} added you`,
    link: `/chat/${opts.chatId}`,
    data: { chatId: opts.chatId },
  });
}

export async function notifyQuestUpdate(
  db: Kysely<DB>,
  opts: { worldId?: string; chatId?: string; questName: string },
): Promise<void> {
  const svc = new NotificationService(db);
  const userIds = opts.chatId
    ? await participantActorIds(db, opts.chatId)
    : opts.worldId
      ? await worldParticipantActorIds(db, opts.worldId)
      : [];
  for (const userId of userIds) {
    await svc.create({
      userId,
      type: NotificationType.QuestUpdate,
      title: `Quest updated: ${opts.questName}`,
      link: opts.chatId ? `/chat/${opts.chatId}` : undefined,
      data: { worldId: opts.worldId, chatId: opts.chatId },
    });
  }
}

export async function notifyGmAction(
  db: Kysely<DB>,
  opts: { worldId: string; description: string },
): Promise<void> {
  const svc = new NotificationService(db);
  const userIds = await worldParticipantActorIds(db, opts.worldId);
  for (const userId of userIds) {
    await svc.create({
      userId,
      type: NotificationType.GmAction,
      title: "GM action",
      body: opts.description,
      worldId: opts.worldId,
      data: { worldId: opts.worldId },
    });
  }
}

export async function notifySystem(
  db: Kysely<DB>,
  opts: { userId: string; title: string; body?: string },
): Promise<void> {
  await new NotificationService(db).create({
    userId: opts.userId,
    type: NotificationType.System,
    title: opts.title,
    body: opts.body,
  });
}
