/**
 * Battle Routes
 *
 * REST endpoints for battle integration:
 *
 *   Equipment:
 *     POST /api/battle/equipment/calculate — calculate equipment modifiers
 *     POST /api/battle/equipment/can-equip — check if item can be equipped
 *     POST /api/battle/equipment/durability — apply durability damage
 *     POST /api/battle/equipment/repair — repair item durability
 *     POST /api/battle/equipment/loot — generate loot from table
 *
 *   Social:
 *     POST /api/battle/social/intimidate — intimidation check
 *     POST /api/battle/social/taunt — taunt check
 *     POST /api/battle/social/surrender — surrender check
 *     POST /api/battle/social/rally — rally allies
 *     POST /api/battle/social/inspire — inspire allies
 *     POST /api/battle/social/demoralize — demoralize enemies
 *
 *   NPC:
 *     POST /api/battle/npc/decision — NPC combat decision
 *     POST /api/battle/npc/memory — create battle memory
 *     POST /api/battle/npc/surrender — NPC surrender check
 *
 *   Weather:
 *     POST /api/battle/weather/modifiers — get environmental modifiers
 *     POST /api/battle/weather/visibility — calculate visibility
 *     POST /api/battle/weather/hazard — generate environmental hazard
 *
 *   Resolution:
 *     POST /api/battle/resolution/damage — calculate damage
 *     POST /api/battle/resolution/attack — attack roll
 *     POST /api/battle/resolution/defense — defense roll
 *     POST /api/battle/resolution/round — process combat round
 *
 *   Morale:
 *     POST /api/battle/morale/compute — compute morale level
 *     POST /api/battle/morale/apply — apply morale modifier
 *     POST /api/battle/morale/break — process morale break
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import {
  applyDurabilityDamage,
  applyMoraleModifier,
  calculateDamage,
  calculateDemoralizeEffect,
  calculateEquipmentModifiers,
  calculateInspireEffect,
  calculateIntimidationEffect,
  calculateRallyEffect,
  calculateSurrenderChance,
  calculateTauntEffect,
  calculateVisibility,
  canEquipItem,
  type CombatStats,
  type CombatWeather,
  computeMoraleLevel,
  createBattleMemory,
  createBattleTerrain,
  type DifficultyClass,
  type EquipmentItem,
  generateEnvironmentalHazard,
  generateLoot,
  getEnvironmentalModifiers,
  type LootTableEntry,
  makeAttackRoll,
  makeNPCDecision,
  makeSavingThrow,
  type MoraleState,
  type NPCBattleMemory,
  type NPCPersonality,
  processMoraleBreak,
  repairItem,
  type RollModifier,
  type TerrainType,
  wouldNPCSurrender,
} from "../battle";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import { SuccessResponse, } from "../validation/schemas";
import { jsonError, jsonResponse, } from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "battle-routes", },);
}

interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

export function battleRoutes(opts: HandlerOpts,) {
  const { database: _database, } = opts;

  return (
    new Elysia({ name: "battle", },)
      // ── Equipment ──────────────────────────────────────────

      .post(
        "/api/battle/equipment/calculate",
        (ctx: any,) => {
          try {
            const body = ctx.body as { items: EquipmentItem[] };
            const modifiers = calculateEquipmentModifiers(body.items,);
            return jsonResponse(modifiers,);
          } catch (error) {
            log().error("Failed to calculate equipment modifiers", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Calculate equipment modifiers",
            description: "Calculate stat modifiers from equipped items.",
            tags: ["Battle",],
          },
        },
      )
      .post(
        "/api/battle/equipment/can-equip",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              item: EquipmentItem;
              characterLevel: number;
              characterStats: CombatStats;
            };
            const result = canEquipItem(body.item, body.characterLevel, body.characterStats,);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to check equip eligibility", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Check if item can be equipped",
            description: "Check level and stat requirements for equipment.",
            tags: ["Battle",],
          },
        },
      )
      .post(
        "/api/battle/equipment/durability",
        (ctx: any,) => {
          try {
            const body = ctx.body as { item: EquipmentItem; damage: number };
            const updated = applyDurabilityDamage(body.item, body.damage,);
            return jsonResponse(updated,);
          } catch (error) {
            log().error("Failed to apply durability damage", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Apply durability damage",
            description: "Reduce item durability from combat usage.",
            tags: ["Battle",],
          },
        },
      )
      .post(
        "/api/battle/equipment/repair",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              item: EquipmentItem;
              repairAmount: number;
              goldCost: number;
            };
            const result = repairItem(body.item, body.repairAmount, body.goldCost,);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to repair item", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Repair item durability",
            description: "Restore item durability at a gold cost.",
            tags: ["Battle",],
          },
        },
      )
      .post(
        "/api/battle/equipment/loot",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              lootTable: LootTableEntry[];
              monsterLevel: number;
            };
            const loot = generateLoot(body.lootTable, body.monsterLevel,);
            return jsonResponse(loot,);
          } catch (error) {
            log().error("Failed to generate loot", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Generate loot from table",
            description: "Roll loot drops based on monster level and loot table.",
            tags: ["Battle",],
          },
        },
      )
      // ── Social ─────────────────────────────────────────────

      .post(
        "/api/battle/social/intimidate",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              attackerLevel: number;
              attackerIntimidation: number;
              targetLevel: number;
              targetMorale: MoraleState;
            };
            const result = calculateIntimidationEffect(
              body.attackerLevel,
              body.attackerIntimidation,
              body.targetLevel,
              body.targetMorale,
            );
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to calculate intimidation", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Intimidation check",
            description: "Calculate intimidation effect on target morale.",
            tags: ["Battle", "Social",],
          },
        },
      )
      .post(
        "/api/battle/social/taunt",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              attackerCharisma: number;
              targetMorale: MoraleState;
              targetPersonality: "aggressive" | "cautious" | "neutral";
            };
            const result = calculateTauntEffect(
              body.attackerCharisma,
              body.targetMorale,
              body.targetPersonality,
            );
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to calculate taunt", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Taunt check",
            description: "Calculate taunt effect based on charisma and target personality.",
            tags: ["Battle", "Social",],
          },
        },
      )
      .post(
        "/api/battle/social/surrender",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              targetMorale: MoraleState;
              attackerReputation: number;
              targetHealthPercent: number;
            };
            const result = calculateSurrenderChance(
              body.targetMorale,
              body.attackerReputation,
              body.targetHealthPercent,
            );
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to calculate surrender", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Surrender check",
            description: "Calculate chance of target surrendering.",
            tags: ["Battle", "Social",],
          },
        },
      )
      .post(
        "/api/battle/social/rally",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              leaderCharisma: number;
              leaderLevel: number;
              allyMorale: MoraleState;
            };
            const result = calculateRallyEffect(
              body.leaderCharisma,
              body.leaderLevel,
              body.allyMorale,
            );
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to calculate rally", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Rally allies",
            description: "Calculate morale boost from rallying allies.",
            tags: ["Battle", "Social",],
          },
        },
      )
      .post(
        "/api/battle/social/inspire",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              leaderCharisma: number;
              leaderInspiration: number;
              allyMorale: MoraleState;
            };
            const result = calculateInspireEffect(
              body.leaderCharisma,
              body.leaderInspiration,
              body.allyMorale,
            );
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to calculate inspire", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Inspire allies",
            description: "Calculate morale boost from inspiring allies.",
            tags: ["Battle", "Social",],
          },
        },
      )
      .post(
        "/api/battle/social/demoralize",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              attackerIntimidation: number;
              attackerLevel: number;
              targetMorale: MoraleState;
            };
            const result = calculateDemoralizeEffect(
              body.attackerIntimidation,
              body.attackerLevel,
              body.targetMorale,
            );
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to calculate demoralize", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Demoralize enemies",
            description: "Calculate morale reduction from demoralizing enemies.",
            tags: ["Battle", "Social",],
          },
        },
      )
      // ── NPC ────────────────────────────────────────────────

      .post(
        "/api/battle/npc/decision",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              personality: NPCPersonality;
              currentHealth: number;
              maxHealth: number;
              enemyCount: number;
              allyCount: number;
              battleMemories: NPCBattleMemory[];
            };
            const decision = makeNPCDecision(
              body.personality,
              body.currentHealth,
              body.maxHealth,
              body.enemyCount,
              body.allyCount,
              body.battleMemories,
            );
            return jsonResponse(decision,);
          } catch (error) {
            log().error("Failed to make NPC decision", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "NPC combat decision",
            description: "Make NPC combat decision based on personality and situation.",
            tags: ["Battle", "NPC",],
          },
        },
      )
      .post(
        "/api/battle/npc/memory",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              battleId: string;
              outcome: "victory" | "defeat" | "draw";
              opponents: string[];
              opponentLevel: number;
              npcLevel: number;
            };
            const memory = createBattleMemory(
              body.battleId,
              body.outcome,
              body.opponents,
              body.opponentLevel,
              body.npcLevel,
            );
            return jsonResponse(memory,);
          } catch (error) {
            log().error("Failed to create battle memory", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Create battle memory",
            description: "Record a battle outcome in NPC memory.",
            tags: ["Battle", "NPC",],
          },
        },
      )
      .post(
        "/api/battle/npc/surrender",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              personality: NPCPersonality;
              currentHealth: number;
              maxHealth: number;
              battleMemories: NPCBattleMemory[];
            };
            const result = wouldNPCSurrender(
              body.personality,
              body.currentHealth,
              body.maxHealth,
              body.battleMemories,
            );
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to check NPC surrender", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "NPC surrender check",
            description: "Check if NPC would surrender based on personality and situation.",
            tags: ["Battle", "NPC",],
          },
        },
      )
      // ── Weather ────────────────────────────────────────────

      .post(
        "/api/battle/weather/modifiers",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              weather: CombatWeather;
              terrain: TerrainType;
            };
            const terrainState = createBattleTerrain(body.terrain, body.weather,);
            const modifiers = getEnvironmentalModifiers(terrainState,);
            return jsonResponse(modifiers,);
          } catch (error) {
            log().error("Failed to get environmental modifiers", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Get environmental modifiers",
            description: "Get combat modifiers from weather and terrain.",
            tags: ["Battle", "Weather",],
          },
        },
      )
      .post(
        "/api/battle/weather/visibility",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              weather: CombatWeather;
              timeOfDay: number;
            };
            const visibility = calculateVisibility(body.weather, body.timeOfDay,);
            return jsonResponse({ visibility, },);
          } catch (error) {
            log().error("Failed to calculate visibility", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Calculate visibility",
            description: "Calculate visibility based on weather and time of day.",
            tags: ["Battle", "Weather",],
          },
        },
      )
      .post(
        "/api/battle/weather/hazard",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              terrain: TerrainType;
              weather: CombatWeather;
            };
            const hazard = generateEnvironmentalHazard(body.terrain, body.weather,);
            return jsonResponse(hazard,);
          } catch (error) {
            log().error("Failed to generate hazard", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Generate environmental hazard",
            description: "Generate a random environmental hazard from terrain and weather.",
            tags: ["Battle", "Weather",],
          },
        },
      )
      // ── Resolution ─────────────────────────────────────────

      .post(
        "/api/battle/resolution/damage",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              baseDamage: string;
              modifiers: { source: string; value: number }[];
              isCritical?: boolean;
              damageType?: "physical" | "magical" | "fire" | "ice" | "lightning" | "poison" | "healing";
            };
            const result = calculateDamage(body.baseDamage, body.modifiers, body.isCritical, body.damageType,);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to calculate damage", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Calculate damage",
            description: "Calculate final damage with modifiers.",
            tags: ["Battle", "Resolution",],
          },
        },
      )
      .post(
        "/api/battle/resolution/attack",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              attackBonus: number;
              targetAC: number;
              advantage?: boolean;
              disadvantage?: boolean;
            };
            const mods: RollModifier[] = [];
            if (body.advantage) { mods.push({ source: "advantage", value: 2, type: "bonus", },); }
            if (body.disadvantage) { mods.push({ source: "disadvantage", value: -2, type: "penalty", },); }
            const result = makeAttackRoll(body.attackBonus, body.targetAC, mods,);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to calculate attack roll", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Attack roll",
            description: "Roll attack against target AC.",
            tags: ["Battle", "Resolution",],
          },
        },
      )
      .post(
        "/api/battle/resolution/defense",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              defenseBonus: number;
              incomingAttack: number;
              advantage?: boolean;
              disadvantage?: boolean;
            };
            const mods: RollModifier[] = [];
            if (body.advantage) { mods.push({ source: "advantage", value: 2, type: "bonus", },); }
            if (body.disadvantage) { mods.push({ source: "disadvantage", value: -2, type: "penalty", },); }
            const dc: DifficultyClass = { name: "defense", value: body.incomingAttack, description: "Defense DC", };
            const result = makeSavingThrow(body.defenseBonus, dc, mods,);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to calculate defense roll", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Defense roll",
            description: "Roll defense against incoming attack.",
            tags: ["Battle", "Resolution",],
          },
        },
      )
      .post(
        "/api/battle/resolution/round",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              combatants: {
                id: string;
                attackBonus: number;
                defenseBonus: number;
                maxHP: number;
              }[];
              currentHP: Record<string, number>;
            };
            // Process combat round: each combatant makes an attack against the next
            const actions: { attacker: string; target: string; roll: number; hit: boolean; currentHP: number }[] = [];
            for (let i = 0; i < body.combatants.length; i++) {
              const c = body.combatants[i];
              const target = body.combatants[(i + 1) % body.combatants.length];
              if (!c || !target) { continue; }
              const roll = makeAttackRoll(c.attackBonus, 10 + target.defenseBonus, [],);
              const hp = body.currentHP[c.id] ?? 0;
              actions.push({
                attacker: c.id,
                target: target.id,
                roll: roll.roll.total,
                hit: roll.hit,
                currentHP: hp,
              },);
            }
            return jsonResponse({ round: 1, actions, summary: `Processed ${actions.length} actions`, },);
          } catch (error) {
            log().error("Failed to process combat round", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Process combat round",
            description: "Process a full combat round with all combatants.",
            tags: ["Battle", "Resolution",],
          },
        },
      )
      // ── Morale ─────────────────────────────────────────────

      .post(
        "/api/battle/morale/compute",
        (ctx: any,) => {
          try {
            const body = ctx.body as { value: number };
            const level = computeMoraleLevel(body.value,);
            return jsonResponse({ level, value: body.value, },);
          } catch (error) {
            log().error("Failed to compute morale", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Compute morale level",
            description: "Compute morale level from numeric value.",
            tags: ["Battle", "Morale",],
          },
        },
      )
      .post(
        "/api/battle/morale/apply",
        (ctx: any,) => {
          try {
            const body = ctx.body as {
              state: MoraleState;
              modifier: { reason: string; value: number; duration: number; appliedAt: string };
            };
            const updated = applyMoraleModifier(body.state, body.modifier,);
            return jsonResponse(updated,);
          } catch (error) {
            log().error("Failed to apply morale modifier", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Apply morale modifier",
            description: "Apply a morale modifier to a combatant's morale state.",
            tags: ["Battle", "Morale",],
          },
        },
      )
      .post(
        "/api/battle/morale/break",
        (ctx: any,) => {
          try {
            const body = ctx.body as { state: MoraleState };
            const result = processMoraleBreak(body.state,);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to process morale break", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          response: { 200: SuccessResponse, },
          detail: {
            summary: "Process morale break",
            description: "Check if morale has broken and apply effects.",
            tags: ["Battle", "Morale",],
          },
        },
      )
  );
}
