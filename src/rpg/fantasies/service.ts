/**
 * Fantasy Service
 *
 * Manages character fantasies and kinks:
 * - Create/track fantasies with categories and intensity
 * - Discovery through play (random chance based on context)
 * - Fulfillment effects and risk tracking
 * - Feeling progression (neutral → like → love)
 *
 * Fantasies are discovered during encounters or defined at creation.
 */
import type { Kysely, } from "kysely";
import type {
  ContentIntensity,
  FantasyCategory,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { jsonStringifyOr, } from "../../utils";
import { nowAndId, parseJsonField, } from "../shared/rpg-service-utils";

// ── Types ──────────────────────────────────────────────────

/** A character fantasy/kink. */
export interface Fantasy {
  id: string;
  actorId: string;
  name: string;
  category: FantasyCategory;
  intensity: ContentIntensity;
  requirements: FantasyRequirements;
  fulfillmentEffects: FulfillmentEffects;
  risks: FantasyRisks;
  discoveredThrough: string | null;
  initialReaction: string;
  currentFeeling: string;
  timesExplored: number;
  createdAt: string;
  updatedAt: string;
}

/** Requirements for fulfilling a fantasy. */
export interface FantasyRequirements {
  partnerType: string[];
  locationType: string[];
  equipment: string[];
  minIntimacy: number;
  minArousal: number;
}

/** Effects when a fantasy is fulfilled. */
export interface FulfillmentEffects {
  satisfactionBonus: number;
  intimacyBonus: number;
  moodBonus: number;
  memoryStrength: number;
  repeatDesire: number;
}

/** Risk factors for a fantasy. */
export interface FantasyRisks {
  reputationRisk: number;
  emotionalRisk: number;
  physicalRisk: number;
  discoveryRisk: number;
}

/** Options for creating a fantasy. */
export interface CreateFantasyOpts {
  database: Kysely<DB>;
  actorId: string;
  name: string;
  category: FantasyCategory;
  intensity?: ContentIntensity;
  requirements?: Partial<FantasyRequirements>;
  fulfillmentEffects?: Partial<FulfillmentEffects>;
  risks?: Partial<FantasyRisks>;
  discoveredThrough?: string;
  initialReaction?: string;
}

/** Result of a fantasy discovery attempt. */
export interface DiscoveryResult {
  discovered: boolean;
  fantasy?: Fantasy;
  reason?: string;
}

// ── Service ────────────────────────────────────────────────

export class FantasyService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Create a fantasy for an actor.
   */
  async createFantasy(opts: CreateFantasyOpts,): Promise<Fantasy> {
    const {
      actorId,
      name,
      category,
      intensity,
      requirements,
      fulfillmentEffects,
      risks,
      discoveredThrough,
      initialReaction,
    } = opts;

    const { id, now, } = nowAndId();

    const defaultRequirements: FantasyRequirements = {
      partnerType: [],
      locationType: [],
      equipment: [],
      minIntimacy: 0,
      minArousal: 0,
    };

    const defaultEffects: FulfillmentEffects = {
      satisfactionBonus: 10,
      intimacyBonus: 3,
      moodBonus: 5,
      memoryStrength: 50,
      repeatDesire: 50,
    };

    const defaultRisks: FantasyRisks = {
      reputationRisk: 0,
      emotionalRisk: 0,
      physicalRisk: 0,
      discoveryRisk: 0,
    };

    await this.db
      .insertInto("character_fantasies",)
      .values({
        id,
        actor_id: actorId,
        fantasy_name: name,
        category,
        intensity: intensity ?? "mild",
        requirements: jsonStringifyOr({ ...defaultRequirements, ...requirements, },),
        fulfillment_effects: jsonStringifyOr({ ...defaultEffects, ...fulfillmentEffects, },),
        risks: jsonStringifyOr({ ...defaultRisks, ...risks, },),
        discovered_through: discoveredThrough ?? null,
        initial_reaction: initialReaction ?? "neutral",
        current_feeling: initialReaction ?? "neutral",
        times_explored: 0,
        created_at: now,
        updated_at: now,
      },)
      .execute();

    const log = getLogger().child({ module: "fantasies", },);
    log.info(`Fantasy created: ${name} (${category}) for ${actorId}`,);

    return {
      id,
      actorId,
      name,
      category,
      intensity: intensity ?? "mild",
      requirements: { ...defaultRequirements, ...requirements, },
      fulfillmentEffects: { ...defaultEffects, ...fulfillmentEffects, },
      risks: { ...defaultRisks, ...risks, },
      discoveredThrough: discoveredThrough ?? null,
      initialReaction: initialReaction ?? "neutral",
      currentFeeling: initialReaction ?? "neutral",
      timesExplored: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get all fantasies for an actor.
   */
  async getActorFantasies(actorId: string,): Promise<Fantasy[]> {
    const rows = await this.db
      .selectFrom("character_fantasies",)
      .where("actor_id", "=", actorId,)
      .orderBy("category", "asc",)
      .orderBy("fantasy_name", "asc",)
      .selectAll()
      .execute();

    return Array.from(rows, (r,) => this.getRow(r as any,),);
  }

  /**
   * Get fantasies by category.
   */
  async getByCategory(
    actorId: string,
    category: FantasyCategory,
  ): Promise<Fantasy[]> {
    const rows = await this.db
      .selectFrom("character_fantasies",)
      .where("actor_id", "=", actorId,)
      .where("category", "=", category,)
      .orderBy("intensity", "asc",)
      .selectAll()
      .execute();

    return Array.from(rows, (r,) => this.getRow(r as any,),);
  }

  /**
   * Attempt to discover a new fantasy through play.
   *
   * Discovery chance is based on:
   * - Context keywords in the approach
   * - Actor's kink_openness (from desire profile)
   * - Random roll
   */
  async attemptDiscovery(
    actorId: string,
    context: string,
    discoveryChance = 0.1,
  ): Promise<DiscoveryResult> {
    // Check if already discovered
    const existing = await this.db
      .selectFrom("character_fantasies",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .execute();

    const contextLower = context.toLowerCase();
    const alreadyKnown = existing.some(
      (f,) => contextLower.includes(f.fantasy_name.toLowerCase(),),
    );

    if (alreadyKnown) {
      return { discovered: false, reason: "Already known", };
    }

    // Roll for discovery
    if (Math.random() >= discoveryChance) {
      return { discovered: false, reason: "No discovery this time", };
    }

    // Determine category from context keywords
    const category = this.inferCategory(contextLower,);
    const fantasy = await this.createFantasy({
      database: this.db,
      actorId,
      name: this.inferName(contextLower,),
      category,
      intensity: "mild",
      discoveredThrough: context,
      initialReaction: "neutral",
    },);

    const log = getLogger().child({ module: "fantasies", },);
    log.info(`Fantasy discovered: ${fantasy.name} (${category}) for ${actorId}`,);

    return { discovered: true, fantasy, };
  }

  /**
   * Record exploration of a fantasy (after encounter).
   */
  async recordExploration(
    fantasyId: string,
    feeling?: string,
  ): Promise<boolean> {
    // Fetch current value first
    const current = await this.db
      .selectFrom("character_fantasies",)
      .select("times_explored",)
      .where("id", "=", fantasyId,)
      .executeTakeFirst();

    if (!current) { return false; }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      times_explored: current.times_explored + 1,
      updated_at: now,
    };

    if (feeling) {
      updates.current_feeling = feeling;
    }

    const result = await this.db
      .updateTable("character_fantasies",)
      .set(updates,)
      .where("id", "=", fantasyId,)
      .executeTakeFirst();

    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  /**
   * Delete a fantasy.
   */
  async deleteFantasy(fantasyId: string,): Promise<boolean> {
    const result = await this.db
      .deleteFrom("character_fantasies",)
      .where("id", "=", fantasyId,)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0n) > 0n;
  }

  // ── Private helpers ───────────────────────────────────

  private getRow(row: {
    id: string;
    actor_id: string;
    fantasy_name: string;
    category: FantasyCategory;
    intensity: ContentIntensity;
    requirements: string;
    fulfillment_effects: string;
    risks: string;
    discovered_through: string | null;
    initial_reaction: string;
    current_feeling: string;
    times_explored: number;
    created_at: string;
    updated_at: string;
  },): Fantasy {
    return {
      id: row.id,
      actorId: row.actor_id,
      name: row.fantasy_name,
      category: row.category,
      intensity: row.intensity,
      requirements: parseJsonField<FantasyRequirements>(row.requirements, {
        partnerType: [],
        locationType: [],
        equipment: [],
        minIntimacy: 0,
        minArousal: 0,
      },),
      fulfillmentEffects: parseJsonField<FulfillmentEffects>(row.fulfillment_effects, {
        satisfactionBonus: 10,
        intimacyBonus: 3,
        moodBonus: 5,
        memoryStrength: 50,
        repeatDesire: 50,
      },),
      risks: parseJsonField<FantasyRisks>(row.risks, {
        reputationRisk: 0,
        emotionalRisk: 0,
        physicalRisk: 0,
        discoveryRisk: 0,
      },),
      discoveredThrough: row.discovered_through,
      initialReaction: row.initial_reaction,
      currentFeeling: row.current_feeling,
      timesExplored: row.times_explored,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Infer fantasy category from context keywords. */
  private inferCategory(context: string,): FantasyCategory {
    if (context.includes("bondage",) || context.includes("restrain",)) { return "bondage"; }
    if (context.includes("public",) || context.includes("expose",)) { return "exhibitionism"; }
    if (context.includes("watch",) || context.includes("peek",)) { return "voyeurism"; }
    if (context.includes("role",) || context.includes("costume",)) { return "roleplay"; }
    if (context.includes("dom",) || context.includes("control",)) { return "power_exchange"; }
    if (context.includes("sub",) || context.includes("obey",)) { return "power_exchange"; }
    if (context.includes("sensation",) || context.includes("touch",)) { return "sensation"; }
    if (context.includes("group",) || context.includes("multiple",)) { return "group"; }
    if (context.includes("pet",) || context.includes("puppy",)) { return "pet_play"; }
    if (context.includes("praise",) || context.includes("compliment",)) { return "praise"; }
    return "roleplay";
  }

  /** Infer fantasy name from context keywords. */
  private inferName(context: string,): string {
    const words: string[] = [];
    for (const w of context.split(/\s+/,)) { if (w.length > 3) { words.push(w,); } }
    const name = words.slice(0, 3,).join(" ",);
    return name.charAt(0,).toUpperCase() + name.slice(1,);
  }
}
