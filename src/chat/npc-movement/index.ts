/**
 * NPC Movement Indicator Service
 *
 * Persists movement events in message metadata and provides
 * query endpoints for movement indicators in chat.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";

/** Movement event stored in message metadata */
export interface MovementEvent {
  actorId: string;
  fromLocationId: string;
  toLocationId: string;
  pattern: string;
  timestamp: string;
}

/** Message metadata structure */
export interface MessageMetadata {
  movement?: MovementEvent[];
  [key: string]: unknown;
}

/** Query options for movement events */
export interface MovementQuery {
  chatId: string;
  actorId?: string;
  since?: string;
  limit?: number;
}

export class NpcMovementIndicatorService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Store movement events in a message's metadata.
   */
  async storeMovementEvents(
    messageId: string,
    events: MovementEvent[],
  ): Promise<void> {
    // Get existing metadata
    const message = await this.db
      .selectFrom("messages",)
      .where("id", "=", messageId,)
      .selectAll()
      .executeTakeFirst();

    const existing: MessageMetadata = jsonParseOr<MessageMetadata>(
      (message?.metadata as string) ?? "{}",
      {},
    );

    // Merge movement events
    const merged: MessageMetadata = {
      ...existing,
      movement: [...(existing.movement ?? []), ...events,],
    };

    // Update message metadata
    await this.db
      .updateTable("messages",)
      .set({ metadata: jsonStringifyOr(merged, "{}",), } as any,)
      .where("id", "=", messageId,)
      .execute();
  }

  /**
   * Get movement events for a chat.
   */
  async getMovementEvents(query: MovementQuery,): Promise<MovementEvent[]> {
    let qb = this.db
      .selectFrom("messages",)
      .where("chat_id", "=", query.chatId,)
      .where("metadata", "is not", null,)
      .selectAll();

    if (query.since) {
      qb = qb.where("created_at", ">=", query.since,);
    }

    if (query.limit) {
      qb = qb.limit(query.limit,);
    }

    const rows = await qb.execute();
    const events: MovementEvent[] = [];

    for (const row of rows) {
      const metadata: MessageMetadata = jsonParseOr<MessageMetadata>(
        (row.metadata as string) ?? "{}",
        {},
      );
      if (metadata.movement) {
        for (const event of metadata.movement) {
          if (!query.actorId || event.actorId === query.actorId) {
            events.push(event,);
          }
        }
      }
    }

    return events;
  }

  /**
   * Get recent movement events for display in chat.
   */
  async getRecentMovements(
    chatId: string,
    limit = 20,
  ): Promise<MovementEvent[]> {
    return this.getMovementEvents({ chatId, limit, },);
  }
}
