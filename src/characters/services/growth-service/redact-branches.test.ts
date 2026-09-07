// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Branch coverage for character growth redaction
 * (src/characters/services/growth-service/redact.ts).
 *
 * Pure shape-trim helpers: null arc, field allow-listing, and the
 * applied-only player-card composition including damaged/empty inputs.
 */
import { describe, expect, test, } from "bun:test";
import {
  ArcStage,
  type CharacterArc,
  GrowthAxis,
  GrowthEntryStatus,
  GrowthEventType,
  type GrowthLogEntry,
} from "../../spec/growth";
import {
  redactArcForPlayerCard,
  redactGrowthLogEntry,
  redactGrowthLogForPlayerCard,
} from "./redact";

/** Minimal applied entry; callers override status/fields per case. */
function makeEntry(overrides?: Partial<GrowthLogEntry>,): GrowthLogEntry {
  return {
    id: "entry-1",
    actorId: "actor-1",
    axis: GrowthAxis.Skill,
    eventType: GrowthEventType.Observation,
    status: GrowthEntryStatus.Applied,
    subjectKind: "skill",
    subjectId: "skill-9",
    beforeJson: '{"level":1}',
    afterJson: '{"level":2}',
    reason: "story milestone",
    sourceEventId: "evt-1",
    recordedAt: "2026-01-01T00:00:00.000Z",
    confirmedAt: "2026-01-02T00:00:00.000Z",
    confirmedBy: "author-1",
    ...overrides,
  };
}

describe("redactArcForPlayerCard", () => {
  test("returns null for a null arc", () => {
    expect(redactArcForPlayerCard(null,),).toBeNull();
  });

  test("trims the arc to the public shape", () => {
    const arc: CharacterArc = {
      actorId: "actor-1",
      currentStage: ArcStage.Crisis,
      stageDescription: "The turning point",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(redactArcForPlayerCard(arc,),).toEqual({
      actorId: "actor-1",
      currentStage: ArcStage.Crisis,
      stageDescription: "The turning point",
    },);
  });

  test("passes through a null stage description", () => {
    const arc: CharacterArc = {
      actorId: "actor-2",
      currentStage: ArcStage.Introduction,
      stageDescription: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const redacted = redactArcForPlayerCard(arc,);
    expect(redacted?.stageDescription,).toBeNull();
  });
});

describe("redactGrowthLogEntry", () => {
  test("strips internal fields to the public allow-list", () => {
    const redacted = redactGrowthLogEntry(makeEntry(),);
    expect(redacted,).toEqual({
      id: "entry-1",
      actorId: "actor-1",
      axis: GrowthAxis.Skill,
      eventType: GrowthEventType.Observation,
      recordedAt: "2026-01-01T00:00:00.000Z",
      reason: "story milestone",
    },);
  });
});

describe("redactGrowthLogForPlayerCard", () => {
  test("keeps applied entries and drops pending/rejected ones", () => {
    const entries = [
      makeEntry({ id: "applied-1", },),
      makeEntry({ id: "pending-1", status: GrowthEntryStatus.Pending, },),
      makeEntry({ id: "rejected-1", status: GrowthEntryStatus.Rejected, },),
    ];
    const redacted = redactGrowthLogForPlayerCard(entries,);
    expect(redacted.map((e,) => e.id),).toEqual(["applied-1",],);
  });

  test("returns an empty view for an empty log", () => {
    expect(redactGrowthLogForPlayerCard([],),).toEqual([],);
  });

  test("returns an empty view when nothing is applied yet", () => {
    const entries = [makeEntry({ id: "p", status: GrowthEntryStatus.Pending, },),];
    expect(redactGrowthLogForPlayerCard(entries,),).toEqual([],);
  });
});
