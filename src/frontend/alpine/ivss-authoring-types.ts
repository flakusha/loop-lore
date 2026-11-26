// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Row kinds exposed by the tree's reorder/delete endpoints. */
/** Extra key `jsonResponse` merges into object bodies (arrays stay bare). */
import {
  CutType,
  FragmentOperation,
  type FragmentStatus,
  type ReferenceLane,
  type ReferenceScope,
  type ScenarioDocKind,
  type ScenarioStatus,
  SceneMode,
  type SceneStatus,
} from "../../db/enums-generation";
export type IvssRowKind = "scene" | "shot" | "fragment";

export interface IvssResponseMeta {
  api_version: string;
  deprecated?: boolean;
}

/** Scenario summary from `GET /scenarios`. */
export interface IvssScenarioSummary {
  id: string;
  worldId: string;
  title: string;
  status: ScenarioStatus;
  updatedAt: string;
  meta?: IvssResponseMeta;
}

/** Shot row from the scenario tree. */
export interface IvssShot {
  id: string;
  sceneId: string;
  sortOrder: number;
  startMs: number;
  endMs: number;
  description: string;
  cutType: CutType;
  cameraJson: string | null;
  narration: string | null;
}

/** Fragment row from the scenario tree. */
export interface IvssFragment {
  id: string;
  sceneId: string;
  shotId: string | null;
  sortOrder: number;
  operation: FragmentOperation;
  status: FragmentStatus;
  workflowId: string;
  workflowHash: string;
  workflowVersion: string | null;
  nodeVersions: string | null;
  mode: SceneMode | null;
  seed: string | null;
  durationFrames: number | null;
  transition: CutType;
  promptMessageId: string | null;
  promptSnapshot: string | null;
  galleryAssetId: string | null;
  caption: string | null;
  inputAssets: string | null;
  outputAssetId: string | null;
  latentAssetId: string | null;
  parentFragmentId: string | null;
  take: string;
  cutInMs: number;
  cutOutMs: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Scene row with its ordered shots and fragments. */
export interface IvssScene {
  id: string;
  scenarioId: string;
  sortOrder: number;
  locationId: string | null;
  mode: SceneMode;
  durationFrames: number;
  fps: number;
  seed: string | null;
  status: SceneStatus;
  generatedAssetId: string | null;
  createdAt: string;
  updatedAt: string;
  shots: IvssShot[];
  fragments: IvssFragment[];
}

/** Reference row carried on the scenario tree (not edited on this page). */
export interface IvssReference {
  id: string;
  scenarioId: string;
  sceneId: string | null;
  shotId: string | null;
  scope: ReferenceScope;
  lane: ReferenceLane;
  role: string | null;
  assetId: string;
  sortOrder: number;
  trimInMs: number | null;
  trimOutMs: number | null;
  stream: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Versioned scenario doc carried on the tree (not edited on this page). */
export interface IvssDoc {
  id: string;
  scenarioId: string;
  kind: ScenarioDocKind;
  title: string;
  body: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Full tree from `GET /scenarios/:id`. */
export interface IvssScenarioDetail extends IvssScenarioSummary {
  createdAt: string;
  scenes: IvssScene[];
  references: IvssReference[];
  docs: IvssDoc[];
}

export interface IvssSceneDraft {
  mode: SceneMode;
  durationFrames: number;
  fps: number;
  locationId: string;
  seed: string;
}

export interface IvssShotDraft {
  sceneId: string;
  startMs: number;
  endMs: number;
  description: string;
  cutType: CutType;
}

export interface IvssFragmentDraft {
  sceneId: string;
  shotId: string;
  operation: FragmentOperation;
  workflowId: string;
  workflowHash: string;
  transition: CutType;
  seed: string;
  durationFrames: number;
  promptSnapshot: string;
}

export interface IvssScenarioDraft {
  worldId: string;
  title: string;
}

/** Alpine state for `x-data="ivssAuthoring()"`. */
export interface IvssAuthoringState {
  scenarios: IvssScenarioSummary[];
  scenarioId: string;
  tree: IvssScenarioDetail | null;
  error: string;
  busy: boolean;
  modes: readonly SceneMode[];
  operations: readonly FragmentOperation[];
  cutTypes: readonly CutType[];
  draftScenario: IvssScenarioDraft;
  draftScene: IvssSceneDraft;
  draftShot: IvssShotDraft;
  draftFragment: IvssFragmentDraft;
  init(): Promise<void>;
  loadScenarios(): Promise<void>;
  loadTree(): Promise<void>;
  createScenario(): Promise<void>;
  addScene(): Promise<void>;
  addShot(sceneId: string,): Promise<void>;
  addFragment(sceneId: string, shotId: string | null,): Promise<void>;
  move(kind: IvssRowKind, id: string, delta: number,): Promise<void>;
  remove(kind: IvssRowKind, id: string,): Promise<void>;
}
