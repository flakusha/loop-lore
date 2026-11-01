// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle inventory reconciliation (D5 B+A decision).
 *
 * Pre-battle preparation (A): snapshot each roster actor's equipped
 * `actor_items` durability so post-battle settlement can report wear.
 * Post-battle reconciliation (B): degrade equipped items by combat damage
 * dealt, mirroring the victory-XP leg's best-effort contract — a settlement
 * failure is logged and swallowed so resolution never fails on bookkeeping.
 */
import type { Kysely, } from "kysely";
import { applyDurabilityDamage, toEquipmentItem, } from "../../../battle/items-integration.js";
import { EquipState, } from "../../../db/enums.js";
import type { DB, } from "../../../db/schema.js";
import type { Combatant, } from "../../../rpg/combat.js";
import { safeJsonStringify, } from "../../../utils.js";
import { jsonParseOr, } from "../../../utils/safe-json.js";
import { log, } from "../log.js";

/** Equipped-item durability snapshot for one actor. */
export interface PrepSnapshot {
  actorId: string;
  items: { id: string; name: string; durability: number }[];
}

/** Per-item wear applied during settlement. */
export interface ReconciledItem {
  id: string;
  name: string;
  durability: number;
  broken: boolean;
}

/**
 * Snapshot equipped-item durability before a battle begins (prep leg).
 *
 * B3 full contract — timing: this is the PRE phase. Staging marks each
 * equipped row's metadata with a `battleStaged` stamp so post-battle
 * settlement can tell staged wear from out-of-band edits. Ambush battles
 * skip staging entirely (defenders get no prep beat).
 * @param db Database handle
 * @param actorIds Roster actor ids to snapshot
 * @param ambush When true, skip staging (ambush-shortened prep)
 * @returns Snapshot per actor (actors without equipped items yield [])
 */
export async function snapshotBattlePrep(
  db: Kysely<DB>,
  actorIds: string[],
  ambush = false,
): Promise<PrepSnapshot[]> {
  const snapshots: PrepSnapshot[] = [];
  if (ambush) { return snapshots; }
  for (const actorId of actorIds) {
    const rows = await db.selectFrom("actor_items",)
      .select(["id", "name", "durability", "metadata",],)
      .where("actor_id", "=", actorId,)
      .where("equipped", "=", EquipState.Equipped,)
      .execute();

    snapshots.push({
      actorId,
      items: rows.map((r,) => ({ id: r.id, name: r.name, durability: r.durability ?? 100, })),
    },);

    for (const row of rows) {
      try {
        const meta = jsonParseOr<Record<string, unknown>>(row.metadata ?? "{}", {},);
        meta.battleStaged = new Date().toISOString();
        const staged = safeJsonStringify(meta,);
        if (staged.ok) {
          await db.updateTable("actor_items",)
            .set({ metadata: staged.value, },)
            .where("id", "=", row.id,)
            .execute();
        }
      } catch (cause) {
        log().warn("Battle prep staging skipped", {
          itemId: row.id,
          cause: cause instanceof Error ? cause.message : String(cause,),
        },);
      }
    }
  }

  return snapshots;
}

/**
 * Read live per-actor wear accrual mid-battle (timing: DURING phase).
 *
 * Derived from the battle's persisted log — no extra write per action.
 * During the fight the log IS the accrual ledger; settlement batches it.
 * @param entries Battle log entries so far
 * @returns Damage dealt per actor id (settlement input)
 */
export function readLiveWearAccrual(entries: { actorId: string; damage?: number }[],): Map<string, number> {
  const accrual = new Map<string, number>();
  for (const entry of entries) {
    if (typeof entry.damage === "number" && entry.damage > 0) {
      accrual.set(entry.actorId, (accrual.get(entry.actorId,) ?? 0) + entry.damage,);
    }
  }

  return accrual;
}

/**
 * Settle post-battle equipment wear (reconciliation leg, best-effort).
 * Degrades each surviving player combatant's equipped items by the total
 * damage that combatant dealt (tracked via battle log actions), clears the
 * `battleStaged` prep stamp, and applies actor drift: combat fatigue as a
 * small temp_hp reduction per round survived (no schema migration; rest and
 * heal paths already restore temp_hp).
 * @param db Database handle
 * @param combatants Final roster
 * @param damageByActor Total damage dealt per actor id
 * @param roundsSurvived Rounds each actor id survived (fatigue input)
 * @returns Wear applied per actor id
 */
export async function reconcileBattleWear(
  db: Kysely<DB>,
  combatants: Combatant[],
  damageByActor: Map<string, number>,
  roundsSurvived: Map<string, number> = new Map(),
): Promise<Map<string, ReconciledItem[]>> {
  const worn = new Map<string, ReconciledItem[]>();
  for (const c of combatants) {
    if (c.isNpc || c.hp <= 0) { continue; }
    const damage = damageByActor.get(c.id,) ?? 0;
    const survived = roundsSurvived.get(c.id,) ?? 0;
    if (damage <= 0 && survived <= 0) { continue; }
    try {
      const rows = await db.selectFrom("actor_items",)
        .selectAll()
        .where("actor_id", "=", c.id,)
        .where("equipped", "=", EquipState.Equipped,)
        .execute();

      const settled: ReconciledItem[] = [];
      for (const row of rows) {
        const meta = jsonParseOr<Record<string, unknown>>(row.metadata ?? "{}", {},);
        delete meta.battleStaged;
        const item = toEquipmentItem({
          id: row.id,
          name: row.name,
          description: row.description ?? "",
          category: row.item_type,
          rarity: "common",
          properties: meta,
        },);

        item.durability = row.durability ?? 100;
        item.maxDurability = row.max_durability ?? 100;
        item.equipped = true;
        const degraded = damage > 0 ? applyDurabilityDamage(item, damage,) : item;
        const cleared = safeJsonStringify(meta,);
        await db.updateTable("actor_items",)
          .set({ durability: degraded.durability, metadata: cleared.ok ? cleared.value : row.metadata, },)
          .where("id", "=", row.id,)
          .execute();

        settled.push({
          id: row.id,
          name: row.name,
          durability: degraded.durability,
          broken: degraded.durability <= 0,
        },);
      }

      if (survived > 0) {
        try {
          const stats = await db.selectFrom("character_stats",)
            .select(["temp_hp",],)
            .where("actor_id", "=", c.id,)
            .executeTakeFirst();

          if (stats) {
            const fatigue = Math.min(survived, 10,);
            await db.updateTable("character_stats",)
              .set({ temp_hp: Math.max(0, (stats.temp_hp ?? 0) - fatigue,), },)
              .where("actor_id", "=", c.id,)
              .execute();
          }
        } catch (cause) {
          log().warn("Battle fatigue skipped", {
            actorId: c.id,
            cause: cause instanceof Error ? cause.message : String(cause,),
          },);
        }
      }

      worn.set(c.id, settled,);
    } catch (cause) {
      log().warn("Battle wear settlement skipped", {
        actorId: c.id,
        cause: cause instanceof Error ? cause.message : String(cause,),
      },);
    }
  }

  return worn;
}
