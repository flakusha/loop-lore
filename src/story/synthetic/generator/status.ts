// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Synthetic Generator — Status Transition Dispatcher
 *
 * transitionStatus: move a SyntheticData row's status via the state
 * machine (no free mutation).
 */
import { SyntheticDataStatus, syntheticDataStatusMachine, } from "../../../db/enums";
import type { GeneratorState, } from "./types";

export async function transitionStatus(
  state: GeneratorState,
  id: string,
  to: SyntheticDataStatus,
  validatedBy?: string,
): Promise<boolean> {
  const row = await state.db
    .selectFrom("synthetic_data",)
    .select(["status",],)
    .where("id", "=", id,)
    .executeTakeFirst();
  if (!row) { return false; }
  if (!syntheticDataStatusMachine.canTransition(row.status, to,)) { return false; }

  const patch: Record<string, unknown> = { status: to, };
  if (to === SyntheticDataStatus.Validated || to === SyntheticDataStatus.Rejected) {
    patch.validated_at = new Date().toISOString();
    if (validatedBy) { patch.validated_by = validatedBy; }
  }
  await state.db.updateTable("synthetic_data",).set(patch,).where("id", "=", id,).execute();
  return true;
}
