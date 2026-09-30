// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Body Systems Enums
 *
 * Open-ended domain unions consolidated into const-object enums so call sites
 * stop leaking magic string literals.
 */
export const Species = {
  Human: "human",
  Elf: "elf",
  Dwarf: "dwarf",
  Orc: "orc",
  Demon: "demon",
  Angel: "angel",
  Beast: "beast",
  Dragon: "dragon",
} as const;
/** */
export type Species = (typeof Species)[keyof typeof Species];

// ── Reproduction Capability Flags ────────────────────────

/**
 * Reproduction capability flags for a species (TASK-038/045 baseline).
 * Species mechanics services derive per-species variants from these
 * flags instead of re-deriving species logic per consumer.
 */
export interface ReproductionCapability {
  /** The species can reproduce at all. */
  canReproduce: boolean;
  /** Reproduction requires an active heat cycle. */
  requiresHeat: boolean;
  /** Cross-species fertilization is possible. */
  crossFertile: boolean;
}
