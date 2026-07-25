/**
 * Character Mood Service
 *
 * Manages happiness meter, mood state, and expression modifiers.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils";
import { guardNotExists, withWorldId, } from "./shared-service-utils";

/** Options for creating mood state */
export interface CreateMoodOpts {
  actorId: string;
  worldId?: string;
  happiness?: number;
  baseMood?: string;
  moodStability?: number;
}

/** Options for updating mood */
export interface UpdateMoodOpts {
  happiness?: number;
  currentMood?: string;
  moodStability?: number;
  expressionModifiers?: Record<string, number>;
}

/** Options for logging a mood event */
export interface LogMoodEventOpts {
  actorId: string;
  worldId?: string;
  eventType: string;
  happinessDelta: number;
  moodOverride?: string;
  source: string;
  sourceId?: string;
}

/** Mood state with expression modifiers */
export interface MoodState {
  id: string;
  actorId: string;
  worldId: string | null;
  happiness: number;
  baseMood: string;
  currentMood: string;
  moodStability: number;
  expressionModifiers: Record<string, number>;
  lastMoodChange: string;
}

/**
 * Character Mood Service
 *
 * Manages character happiness, mood state, and expression modifiers.
 * Happiness ranges from 0-100, with 50 being neutral.
 */
export class MoodService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Get mood state for a character
   * @param actorId - Character actor ID
   * @param worldId - Optional world ID for world-specific mood
   * @returns Mood state or undefined
   */
  async getMood(actorId: string, worldId?: string,): Promise<MoodState | undefined> {
    const row = await withWorldId(
      this.db.selectFrom("character_mood",).where("actor_id", "=", actorId,),
      worldId,
    )
      .selectAll()
      .executeTakeFirst();

    if (!row) { return undefined; }

    return {
      id: row.id,
      actorId: row.actor_id,
      worldId: row.world_id,
      happiness: row.happiness,
      baseMood: row.base_mood,
      currentMood: row.current_mood,
      moodStability: row.mood_stability,
      expressionModifiers: jsonParseOr(row.expression_modifiers, {},),
      lastMoodChange: row.last_mood_change,
    };
  }

  /**
   * Create or initialize mood state for a character
   * @param opts - Mood creation options
   * @returns Created mood ID
   */
  async createMood(opts: CreateMoodOpts,): Promise<string> {
    const existing = await this.getMood(opts.actorId, opts.worldId,);
    guardNotExists(existing, "Mood", opts.actorId,);

    const id = randomUUID();
    const now = new Date().toISOString();

    await this.db
      .insertInto("character_mood",)
      .values({
        id,
        actor_id: opts.actorId,
        world_id: opts.worldId ?? null,
        happiness: opts.happiness ?? 50,
        base_mood: opts.baseMood ?? "neutral",
        current_mood: opts.baseMood ?? "neutral",
        mood_stability: opts.moodStability ?? 0.5,
        expression_modifiers: JSON.stringify({
          tone: 0,
          verbosity: 0,
          cooperation: 0,
          warmth: 0,
          humor: 0,
          formality: 0,
        },),
        last_mood_change: now,
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return id;
  }

  /**
   * Update mood state
   * @param actorId - Character actor ID
   * @param worldId - Optional world ID
   * @param opts - Update options
   */
  async updateMood(actorId: string, worldId: string | undefined, opts: UpdateMoodOpts,): Promise<void> {
    const existing = await this.getMood(actorId, worldId,);
    if (!existing) {
      throw new Error(`Mood not found for actor ${actorId}`,);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (opts.happiness !== undefined) {
      updateData.happiness = Math.max(0, Math.min(100, opts.happiness,),);
      updateData.last_mood_change = now;
    }
    if (opts.currentMood !== undefined) {
      updateData.current_mood = opts.currentMood;
      updateData.last_mood_change = now;
    }
    if (opts.moodStability !== undefined) {
      updateData.mood_stability = opts.moodStability;
    }
    if (opts.expressionModifiers !== undefined) {
      updateData.expression_modifiers = JSON.stringify(opts.expressionModifiers,);
    }

    await withWorldId(
      this.db.updateTable("character_mood",).set(updateData,).where("actor_id", "=", actorId,),
      worldId,
    ).execute();
  }

  /**
   * Apply happiness delta (positive or negative)
   * @param actorId - Character actor ID
   * @param worldId - Optional world ID
   * @param delta - Happiness change (-100 to +100)
   * @returns New happiness value
   */
  async applyHappinessDelta(actorId: string, worldId: string | undefined, delta: number,): Promise<number> {
    const mood = await this.getMood(actorId, worldId,);
    if (!mood) {
      throw new Error(`Mood not found for actor ${actorId}`,);
    }

    // Apply stability modifier (higher stability = less mood swing)
    const effectiveDelta = delta * (1 - mood.moodStability * 0.5);
    const newHappiness = Math.max(0, Math.min(100, mood.happiness + effectiveDelta,),);

    // Determine mood from happiness
    const newMood = this.happinessToMood(newHappiness,);

    await this.updateMood(actorId, worldId, {
      happiness: newHappiness,
      currentMood: newMood,
    },);

    return newHappiness;
  }

  /**
   * Log a mood event
   * @param opts - Event options
   */
  async logEvent(opts: LogMoodEventOpts,): Promise<string> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await this.db
      .insertInto("mood_events",)
      .values({
        id,
        actor_id: opts.actorId,
        world_id: opts.worldId ?? null,
        event_type: opts.eventType,
        happiness_delta: opts.happinessDelta,
        mood_override: opts.moodOverride ?? null,
        source: opts.source,
        source_id: opts.sourceId ?? null,
        created_at: now,
      },)
      .execute();

    // Apply the happiness delta
    await this.applyHappinessDelta(opts.actorId, opts.worldId, opts.happinessDelta,);

    return id;
  }

  /**
   * Get mood events for a character
   * @param actorId - Character actor ID
   * @param worldId - Optional world ID
   * @param limit - Max events to return
   * @returns List of mood events
   */
  async getEvents(actorId: string, worldId?: string, limit = 50,) {
    return withWorldId(
      this.db.selectFrom("mood_events",).where("actor_id", "=", actorId,),
      worldId,
    )
      .orderBy("created_at", "desc",)
      .limit(limit,)
      .selectAll()
      .execute();
  }

  /**
   * Convert happiness value to mood string
   * @param happiness - Happiness value (0-100)
   * @returns Mood string
   */
  private happinessToMood(happiness: number,): string {
    if (happiness >= 80) { return "ecstatic"; }
    if (happiness >= 60) { return "happy"; }
    if (happiness >= 45) { return "neutral"; }
    if (happiness >= 25) { return "sad"; }
    return "miserable";
  }
}
