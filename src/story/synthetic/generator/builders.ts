/**
 * Synthetic Generator — Case Builders
 *
 * Derive one SyntheticCase per target type from the gathered source.
 */
import { SyntheticDataType, } from "../../../db/enums";
import { assertNever, } from "../../../utils";
import type { SyntheticCase, SyntheticSource, } from "../types";
import type { GeneratorState, } from "./types";

export function build(state: GeneratorState, type: SyntheticDataType, source: SyntheticSource,): SyntheticCase[] {
  switch (type) {
    case SyntheticDataType.TurnSequence: {
      return buildTurnSequence(state, source,);
    }
    case SyntheticDataType.QualityEvaluation: {
      return buildQualityEvaluation(state, source,);
    }
    case SyntheticDataType.QuestProgression: {
      return buildQuestProgression(state, source,);
    }
    case SyntheticDataType.WorldStateTransition: {
      return buildWorldStateTransition(state, source,);
    }
    case SyntheticDataType.RegenerationCase: {
      return buildRegenerationCase(state, source,);
    }
    case SyntheticDataType.GmEscalation: {
      return buildGmEscalation(state, source,);
    }
    default: {
      return assertNever(type,);
    }
  }
}

function buildTurnSequence(state: GeneratorState, source: SyntheticSource,): SyntheticCase[] {
  const seq = source.messages.slice(0, state.maxScenarios,);
  return Array.from(seq, (m, i,) => ({
    id: state.idGenerator(),
    type: SyntheticDataType.TurnSequence,
    description: `Replay turn ${i + 1} from actor ${m.actorId}`,
    input: { actorId: m.actorId, role: m.role, priorContent: m.content.slice(0, 200,), },
    expected: { nextActorId: seq[i + 1]?.actorId ?? null, },
  }),);
}

function buildQualityEvaluation(state: GeneratorState, source: SyntheticSource,): SyntheticCase[] {
  return Array.from(source.messages.slice(0, state.maxScenarios,), (m,) => ({
    id: state.idGenerator(),
    type: SyntheticDataType.QualityEvaluation,
    description: `Score narrative quality for actor ${m.actorId} message`,
    input: { content: m.content.slice(0, 200,), },
    expected: { passed: true, minScore: 0.6, },
  }),);
}

function buildQuestProgression(state: GeneratorState, source: SyntheticSource,): SyntheticCase[] {
  return Array.from(source.questProgress.slice(0, state.maxScenarios,), (p,) => ({
    id: state.idGenerator(),
    type: SyntheticDataType.QuestProgression,
    description: `Advance quest ${p.questId} from progress ${p.progress}`,
    input: { questId: p.questId, currentProgress: p.progress, },
    expected: { status: p.status, advanced: p.progress < 100, },
  }),);
}

function buildWorldStateTransition(state: GeneratorState, source: SyntheticSource,): SyntheticCase[] {
  const states = source.worldStates.slice(0, state.maxScenarios,);
  const cases: SyntheticCase[] = [];
  for (let i = 1; i < states.length; i++) {
    const from = states[i - 1];
    const to = states[i];
    if (!from || !to) { continue; }
    cases.push({
      id: state.idGenerator(),
      type: SyntheticDataType.WorldStateTransition,
      description: `Transition world state ${from.id} → ${to.id}`,
      input: { from: from.snapshot, to: to.snapshot, },
      expected: { consistent: true, },
    },);
  }
  return cases;
}

function buildRegenerationCase(state: GeneratorState, source: SyntheticSource,): SyntheticCase[] {
  const failed: SyntheticCase[] = [];
  for (const m of source.messages) {
    if (m.role === "system" && failed.length < state.maxScenarios) {
      failed.push({
        id: state.idGenerator(),
        type: SyntheticDataType.RegenerationCase,
        description: `Regenerate low-quality turn for actor ${m.actorId}`,
        input: { actorId: m.actorId, original: m.content.slice(0, 200,), },
        expected: { regenerated: true, improvedScore: 0.7, },
      },);
    }
  }
  return failed;
}

function buildGmEscalation(state: GeneratorState, source: SyntheticSource,): SyntheticCase[] {
  const escalatable: SyntheticCase[] = [];
  for (const q of source.quests) {
    if (q.status === "active" && escalatable.length < state.maxScenarios) {
      escalatable.push({
        id: state.idGenerator(),
        type: SyntheticDataType.GmEscalation,
        description: `GM escalation for stalled quest ${q.id}`,
        input: { questId: q.id, config: q.config, },
        expected: { escalated: true, decision: "inject_event", },
      },);
    }
  }
  return escalatable;
}
