/**
 * Synthetic Generator — Phase 6 Story Infrastructure
 *
 * Derives QA scenarios from real chat/world state and persists them as
 * SyntheticData rows. Covers all SyntheticDataType kinds. Status transitions
 * are validated through the syntheticDataStatusMachine (no free mutation).
 *
 * Method bodies live in sibling dispatcher modules (source, builders,
 * persist, status) threaded with an explicit `GeneratorState` handle. The
 * class is kept so the constructor-based public surface is unchanged.
 */
import type { Kysely, } from "kysely";
import type { SyntheticDataStatus, } from "../../../db/enums";
import { SyntheticDataType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { uid, } from "../../../utils";
import { build, } from "./builders";
import { persist, } from "./persist";
import { fetchSource, } from "./source";
import { transitionStatus, } from "./status";
import type { GeneratorState, SyntheticGeneratorOptions, } from "./types";

export type { GeneratorState, SyntheticGeneratorOptions, } from "./types";

const ALL_TYPES: readonly SyntheticDataType[] = [
  SyntheticDataType.TurnSequence,
  SyntheticDataType.QualityEvaluation,
  SyntheticDataType.QuestProgression,
  SyntheticDataType.WorldStateTransition,
  SyntheticDataType.RegenerationCase,
  SyntheticDataType.GmEscalation,
];

export class SyntheticGenerator {
  private readonly db: Kysely<DB>;
  private readonly idGenerator: () => string;
  private readonly maxScenarios: number;

  constructor(options: SyntheticGeneratorOptions,) {
    this.db = options.db;
    this.idGenerator = options.idGenerator ?? (() => uid());
    this.maxScenarios = options.maxScenarios ?? 10;
  }

  private get state(): GeneratorState {
    return { db: this.db, idGenerator: this.idGenerator, maxScenarios: this.maxScenarios, };
  }

  /**
   * Generate synthetic scenarios for a chat across the requested types.
   */
  async generateForChat(chatId: string, types?: SyntheticDataType[],): Promise<string[]> {
    const source = await fetchSource(this.state, chatId,);
    if (!source) { return []; }

    const targetTypes = types && types.length > 0 ? types : [...ALL_TYPES,];
    const ids: string[] = [];

    for (const type of targetTypes) {
      const cases = build(this.state, type, source,);
      if (cases.length === 0) { continue; }
      const id = await persist(this.state, chatId, source.worldId, type, source, cases,);
      ids.push(id,);
    }

    return ids;
  }

  /**
   * Transition a SyntheticData row's status via the state machine.
   */
  async transitionStatus(id: string, to: SyntheticDataStatus, validatedBy?: string,): Promise<boolean> {
    return transitionStatus(this.state, id, to, validatedBy,);
  }
}
