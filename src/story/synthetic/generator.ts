/**
 * Synthetic Generator — Phase 6 Story Infrastructure
 *
 * Derives QA scenarios from real chat/world state and persists them as
 * SyntheticData rows. Covers all SyntheticDataType kinds. Status transitions
 * are validated through the syntheticDataStatusMachine (no free mutation).
 *
 * Design: read-only derivation + insert. No LLM calls, no route wiring.
 */
import type { Kysely, } from "kysely";
import { SyntheticDataStatus, syntheticDataStatusMachine, SyntheticDataType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { assertNever, jsonParseOr, safeJsonStringify, uid, } from "../../utils";
import type { SyntheticCase, SyntheticSource, } from "./types";

const ALL_TYPES: readonly SyntheticDataType[] = [
  SyntheticDataType.TurnSequence,
  SyntheticDataType.QualityEvaluation,
  SyntheticDataType.QuestProgression,
  SyntheticDataType.WorldStateTransition,
  SyntheticDataType.RegenerationCase,
  SyntheticDataType.GmEscalation,
];

export interface SyntheticGeneratorOptions {
  db: Kysely<DB>;
  /** Override id generator (testing/injectable) */
  idGenerator?: () => string;
  /** Cap on cases produced per type */
  maxScenarios?: number;
}

export class SyntheticGenerator {
  private readonly db: Kysely<DB>;
  private readonly idGenerator: () => string;
  private readonly maxScenarios: number;

  constructor(options: SyntheticGeneratorOptions,) {
    this.db = options.db;
    this.idGenerator = options.idGenerator ?? (() => uid());
    this.maxScenarios = options.maxScenarios ?? 10;
  }

  /**
   * Generate synthetic scenarios for a chat across the requested types.
   *
   * @param chatId - Chat to derive scenarios from
   * @param types - Types to generate; defaults to all
   * @returns IDs of created SyntheticData rows
   */
  async generateForChat(chatId: string, types?: SyntheticDataType[],): Promise<string[]> {
    const source = await this.fetchSource(chatId,);
    if (!source) { return []; }

    const targetTypes = types && types.length > 0 ? types : [...ALL_TYPES,];
    const ids: string[] = [];

    for (const type of targetTypes) {
      const cases = this.build(type, source,);
      if (cases.length === 0) { continue; }
      const id = await this.persist(chatId, source.worldId, type, source, cases,);
      ids.push(id,);
    }

    return ids;
  }

  /**
   * Transition a SyntheticData row's status via the state machine.
   *
   * @returns false if the transition is invalid or the row is missing
   */
  async transitionStatus(id: string, to: SyntheticDataStatus, validatedBy?: string,): Promise<boolean> {
    const row = await this.db
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
    await this.db.updateTable("synthetic_data",).set(patch,).where("id", "=", id,).execute();
    return true;
  }

  // ─── Source Gathering ─────────────────────────────────────────

  private async fetchSource(chatId: string,): Promise<SyntheticSource | null> {
    const chat = await this.db
      .selectFrom("chats",)
      .select(["world_id",],)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    if (!chat) { return null; }

    const [messages, quests, questProgress, worldStates,] = await Promise.all([
      this.db
        .selectFrom("messages",)
        .select(["actor_id", "role", "content",],)
        .where("chat_id", "=", chatId,)
        .orderBy("created_at", "asc",)
        .limit(500,)
        .execute(),
      this.db
        .selectFrom("quests",)
        .select(["id", "type", "status", "config",],)
        .where("world_id", "=", chat.world_id ?? "",)
        .execute(),
      this.db
        .selectFrom("quest_progress",)
        .select(["quest_id", "progress", "status",],)
        .where("chat_id", "=", chatId,)
        .execute(),
      this.db
        .selectFrom("world_states",)
        .select(["id", "snapshot",],)
        .where("world_id", "=", chat.world_id ?? "",)
        .orderBy("created_at", "desc",)
        .limit(20,)
        .execute(),
    ],);

    return {
      chatId,
      worldId: chat.world_id ?? null,
      messages: messages.map((m,) => ({
        actorId: m.actor_id,
        role: m.role,
        content: m.content,
      })),
      quests: quests.map((q,) => ({
        id: q.id,
        type: q.type,
        status: q.status,
        config: jsonParseOr(q.config, {},),
      })),
      questProgress: questProgress.map((p,) => ({
        questId: p.quest_id,
        progress: p.progress,
        status: p.status,
      })),
      worldStates: worldStates.map((w,) => ({
        id: w.id,
        snapshot: jsonParseOr(w.snapshot, {},),
      })),
    };
  }

  // ─── Case Builders ────────────────────────────────────────────

  private build(type: SyntheticDataType, source: SyntheticSource,): SyntheticCase[] {
    switch (type) {
      case SyntheticDataType.TurnSequence: {
        return this.buildTurnSequence(source,);
      }
      case SyntheticDataType.QualityEvaluation: {
        return this.buildQualityEvaluation(source,);
      }
      case SyntheticDataType.QuestProgression: {
        return this.buildQuestProgression(source,);
      }
      case SyntheticDataType.WorldStateTransition: {
        return this.buildWorldStateTransition(source,);
      }
      case SyntheticDataType.RegenerationCase: {
        return this.buildRegenerationCase(source,);
      }
      case SyntheticDataType.GmEscalation: {
        return this.buildGmEscalation(source,);
      }
      default: {
        return assertNever(type,);
      }
    }
  }

  private buildTurnSequence(source: SyntheticSource,): SyntheticCase[] {
    const seq = source.messages.slice(0, this.maxScenarios,);
    return seq.map((m, i,) => ({
      id: this.idGenerator(),
      type: SyntheticDataType.TurnSequence,
      description: `Replay turn ${i + 1} from actor ${m.actorId}`,
      input: { actorId: m.actorId, role: m.role, priorContent: m.content.slice(0, 200,), },
      expected: { nextActorId: seq[i + 1]?.actorId ?? null, },
    }));
  }

  private buildQualityEvaluation(source: SyntheticSource,): SyntheticCase[] {
    return source.messages.slice(0, this.maxScenarios,).map((m,) => ({
      id: this.idGenerator(),
      type: SyntheticDataType.QualityEvaluation,
      description: `Score narrative quality for actor ${m.actorId} message`,
      input: { content: m.content.slice(0, 200,), },
      expected: { passed: true, minScore: 0.6, },
    }));
  }

  private buildQuestProgression(source: SyntheticSource,): SyntheticCase[] {
    return source.questProgress.slice(0, this.maxScenarios,).map((p,) => ({
      id: this.idGenerator(),
      type: SyntheticDataType.QuestProgression,
      description: `Advance quest ${p.questId} from progress ${p.progress}`,
      input: { questId: p.questId, currentProgress: p.progress, },
      expected: { status: p.status, advanced: p.progress < 100, },
    }));
  }

  private buildWorldStateTransition(source: SyntheticSource,): SyntheticCase[] {
    const states = source.worldStates.slice(0, this.maxScenarios,);
    const cases: SyntheticCase[] = [];
    for (let i = 1; i < states.length; i++) {
      const from = states[i - 1];
      const to = states[i];
      if (!from || !to) { continue; }
      cases.push({
        id: this.idGenerator(),
        type: SyntheticDataType.WorldStateTransition,
        description: `Transition world state ${from.id} → ${to.id}`,
        input: { from: from.snapshot, to: to.snapshot, },
        expected: { consistent: true, },
      },);
    }
    return cases;
  }

  private buildRegenerationCase(source: SyntheticSource,): SyntheticCase[] {
    const failed = source.messages.filter((m,) => m.role === "system").slice(0, this.maxScenarios,);
    return failed.map((m,) => ({
      id: this.idGenerator(),
      type: SyntheticDataType.RegenerationCase,
      description: `Regenerate low-quality turn for actor ${m.actorId}`,
      input: { actorId: m.actorId, original: m.content.slice(0, 200,), },
      expected: { regenerated: true, improvedScore: 0.7, },
    }));
  }

  private buildGmEscalation(source: SyntheticSource,): SyntheticCase[] {
    const escalatable = source.quests.filter((q,) => q.status === "active").slice(0, this.maxScenarios,);
    return escalatable.map((q,) => ({
      id: this.idGenerator(),
      type: SyntheticDataType.GmEscalation,
      description: `GM escalation for stalled quest ${q.id}`,
      input: { questId: q.id, config: q.config, },
      expected: { escalated: true, decision: "inject_event", },
    }));
  }

  // ─── Persistence ──────────────────────────────────────────────

  private async persist(
    chatId: string,
    worldId: string | null,
    type: SyntheticDataType,
    source: SyntheticSource,
    cases: SyntheticCase[],
  ): Promise<string> {
    const id = this.idGenerator();
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

    await this.db
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
}
