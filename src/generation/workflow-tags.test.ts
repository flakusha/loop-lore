import { describe, expect, test, } from "bun:test";
import {
  composeWorkflowTags,
  parseWorkflowTag,
  parseWorkflowTags,
  WorkflowKind,
  WorkflowModality,
} from "./workflow-tags";

describe("workflow-tags", () => {
  test("composeWorkflowTags encodes canonical strings", () => {
    expect(
      composeWorkflowTags([
        { kind: WorkflowKind.Character, modality: WorkflowModality.Image, },
        { kind: WorkflowKind.Location, modality: WorkflowModality.Video, },
      ],),
    ).toEqual(["character:image", "location:video",],);
  });

  test("parseWorkflowTag round-trips valid tags", () => {
    expect(parseWorkflowTag("monster:image",),).toEqual({
      kind: WorkflowKind.Monster,
      modality: WorkflowModality.Image,
    },);
  });

  test("parseWorkflowTag is case-insensitive and trims", () => {
    expect(parseWorkflowTag("  ITEM:Video ",),).toEqual({
      kind: WorkflowKind.Item,
      modality: WorkflowModality.Video,
    },);
  });

  test("parseWorkflowTag rejects malformed input", () => {
    expect(parseWorkflowTag("character",),).toBeNull();
    expect(parseWorkflowTag("character:audio",),).toBeNull();
    expect(parseWorkflowTag("dragon:image",),).toBeNull();
    expect(parseWorkflowTag("",),).toBeNull();
  });

  test("parseWorkflowTags drops malformed entries", () => {
    expect(parseWorkflowTags(["character:image", "bad", "item:video",],),).toEqual([
      { kind: WorkflowKind.Character, modality: WorkflowModality.Image, },
      { kind: WorkflowKind.Item, modality: WorkflowModality.Video, },
    ],);
  });
});
