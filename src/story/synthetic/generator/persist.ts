// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Synthetic Generator — Persistence Dispatcher
 *
 * persist: serialize a batch of cases and insert a SyntheticData row.
 */
import type { SyntheticDataType, } from "../../../db/enums";
import { SyntheticDataStatus, } from "../../../db/enums";
import { getLogger, } from "../../../logger";
import { safeJsonStringify, } from "../../../utils";
import type { SyntheticCase, SyntheticSource, } from "../types";
import type { GeneratorState, } from "./types";

/**
 * @param state
 * @param chatId
 * @param worldId
 * @param type
 * @param source
 * @param cases
 */
export async function persist(
  state: GeneratorState,
  chatId: string,
  worldId: string | null,
  type: SyntheticDataType,
  source: SyntheticSource,
  cases: SyntheticCase[],
): Promise<string> {
  const id = state.idGenerator();
  const casesJson = safeJsonStringify(cases,);
  const sourceJson = safeJsonStringify(source,);
  const metadata = safeJsonStringify({
    caseCount: cases.length,
    generatedAt: new Date().toISOString(),
  },);

  const failures: string[] = [];
  if (!casesJson.ok) { failures.push(`cases: ${casesJson.error.message}`,); }
  if (!sourceJson.ok) { failures.push(`source: ${sourceJson.error.message}`,); }
  if (!metadata.ok) { failures.push(`metadata: ${metadata.error.message}`,); }
  if (failures.length > 0) {
    getLogger()
      .child({ module: "synthetic-generator", },)
      .error("serialization failed", undefined, { failures, },);
    throw new Error("Failed to serialize synthetic data",);
  }

  const casesStr = casesJson.ok ? casesJson.value : "";
  const sourceStr = sourceJson.ok ? sourceJson.value : "";
  const metaStr = metadata.ok ? metadata.value : "";

  await state.db
    .insertInto("synthetic_data",)
    .values({
      id,
      chat_id: chatId,
      world_id: worldId,
      type,
      source_data: sourceStr,
      generated_cases: casesStr,
      metadata: metaStr,
      status: SyntheticDataStatus.Generated,
    },)
    .execute();

  return id;
}
