// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * IVSS scenario authoring tree.
 *
 * `init()` owns the first load (the view is reachable by anonymous visitors,
 * so an `hx-trigger="load"` would 401 on every anonymous render). Every write
 * reloads the tree from the server: rendered order and status always mirror
 * persisted rows instead of a client-side guess.
 */
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
import { apiFetch, } from "./htmx.js";
import { jsonBody, safeJsonParse, } from "./json";

const PREFIX = "/api/v1/ivss";
const JSON_HEADERS = { "Content-Type": "application/json", };

/** Row kinds exposed by the tree's reorder/delete endpoints. */
export type IvssRowKind = "scene" | "shot" | "fragment";

/** Extra key `jsonResponse` merges into object bodies (arrays stay bare). */
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

/** Reflect every API action's progress and failure in one place. */
async function withBusy(
  target: Pick<IvssAuthoringState, "busy" | "error">,
  work: () => Promise<void>,
): Promise<void> {
  target.busy = true;
  target.error = "";
  try {
    await work();
  } catch (err) {
    target.error = err instanceof Error ? err.message : String(err,);
  } finally {
    target.busy = false;
  }
}

/** @param res - successful apiFetch response */
async function readJson<T,>(res: Response,): Promise<T> {
  const parsed = safeJsonParse<T>(await res.text(),);
  if (!parsed.ok) { throw parsed.error; }
  return parsed.value;
}

/**
 * Ids of the sibling group a row belongs to, in rendered order.
 * @param tree - currently rendered tree
 * @param kind - row kind
 * @param id - row to locate
 */
function orderedIds(
  tree: IvssScenarioDetail | null,
  kind: IvssRowKind,
  id: string,
): string[] {
  if (!tree) { return []; }
  if (kind === "scene") { return tree.scenes.map((scene,) => scene.id); }
  if (kind === "shot") {
    const owner = tree.scenes.find((scene,) => scene.shots.some((shot,) => shot.id === id));
    return owner ? owner.shots.map((shot,) => shot.id) : [];
  }

  const owner = tree.scenes.find((scene,) => scene.fragments.some((fragment,) => fragment.id === id));
  return owner ? owner.fragments.map((fragment,) => fragment.id) : [];
}

/** @returns the Alpine component object for `x-data` */
export function ivssAuthoring(): IvssAuthoringState {
  return {
    scenarios: [],
    scenarioId: "",
    tree: null,
    error: "",
    busy: false,
    modes: Object.values(SceneMode,),
    operations: Object.values(FragmentOperation,),
    cutTypes: Object.values(CutType,),
    draftScenario: { worldId: "", title: "", },
    draftScene: {
      mode: SceneMode.TextToVideo,
      durationFrames: 120,
      fps: 24,
      locationId: "",
      seed: "",
    },
    draftShot: {
      sceneId: "",
      startMs: 0,
      endMs: 2000,
      description: "",
      cutType: CutType.HardCut,
    },
    draftFragment: {
      sceneId: "",
      shotId: "",
      operation: FragmentOperation.Render,
      workflowId: "",
      workflowHash: "",
      transition: CutType.HardCut,
      seed: "",
      durationFrames: 120,
      promptSnapshot: "",
    },

    init(): Promise<void> {
      if (!globalThis.__USER_ID) {
        this.error = "Sign in to author IVSS scenarios.";
        return Promise.resolve();
      }

      return this.loadScenarios();
    },

    loadScenarios(): Promise<void> {
      return withBusy(this, async () => {
        this.scenarios = await readJson<IvssScenarioSummary[]>(
          await apiFetch(`${PREFIX}/scenarios`,),
        );
      },);
    },

    loadTree(): Promise<void> {
      if (!this.scenarioId) { return Promise.resolve(); }
      const id = this.scenarioId;
      return withBusy(this, async () => {
        this.tree = await readJson<IvssScenarioDetail>(
          await apiFetch(`${PREFIX}/scenarios/${encodeURIComponent(id,)}`,),
        );
      },);
    },

    createScenario(): Promise<void> {
      const { worldId, title, } = this.draftScenario;
      return withBusy(this, async () => {
        const created = await readJson<IvssScenarioSummary>(
          await apiFetch(`${PREFIX}/scenarios`, {
            method: "POST",
            headers: JSON_HEADERS,
            body: jsonBody({ worldId, title, },),
          },),
        );

        this.scenarioId = created.id;
        await this.loadScenarios();
        await this.loadTree();
      },);
    },

    addScene(): Promise<void> {
      const scenarioId = this.scenarioId;
      if (!scenarioId) { return Promise.resolve(); }
      const draft = this.draftScene;
      return withBusy(this, async () => {
        const body: Record<string, unknown> = {
          mode: draft.mode,
          durationFrames: draft.durationFrames,
          fps: draft.fps,
        };

        if (draft.locationId) { body.locationId = draft.locationId; }
        if (draft.seed) { body.seed = draft.seed; }
        await apiFetch(`${PREFIX}/scenarios/${encodeURIComponent(scenarioId,)}/scenes`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: jsonBody(body,),
        },);

        await this.loadTree();
      },);
    },

    addShot(sceneId: string,): Promise<void> {
      if (!sceneId) { return Promise.resolve(); }
      const draft = this.draftShot;
      return withBusy(this, async () => {
        await apiFetch(`${PREFIX}/scenes/${encodeURIComponent(sceneId,)}/shots`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: jsonBody({
            startMs: draft.startMs,
            endMs: draft.endMs,
            description: draft.description,
            cutType: draft.cutType,
          },),
        },);

        await this.loadTree();
      },);
    },

    addFragment(sceneId: string, shotId: string | null,): Promise<void> {
      if (!sceneId) { return Promise.resolve(); }
      const draft = this.draftFragment;
      return withBusy(this, async () => {
        const body: Record<string, unknown> = {
          operation: draft.operation,
          workflowId: draft.workflowId,
          workflowHash: draft.workflowHash,
          transition: draft.transition,
        };

        if (shotId) { body.shotId = shotId; }
        if (draft.seed) { body.seed = draft.seed; }
        if (draft.durationFrames) { body.durationFrames = draft.durationFrames; }
        if (draft.promptSnapshot) { body.promptSnapshot = draft.promptSnapshot; }
        await apiFetch(`${PREFIX}/scenes/${encodeURIComponent(sceneId,)}/fragments`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: jsonBody(body,),
        },);

        await this.loadTree();
      },);
    },

    move(kind: IvssRowKind, id: string, delta: number,): Promise<void> {
      const ids = orderedIds(this.tree, kind, id,);
      const at = ids.indexOf(id,);
      const to = at + delta;
      if (at < 0 || to < 0 || to >= ids.length) { return Promise.resolve(); }
      const next = ids.slice();
      const [moved,] = next.splice(at, 1,);
      if (moved === undefined) { return Promise.resolve(); }
      next.splice(to, 0, moved,);
      return withBusy(this, async () => {
        await apiFetch(`${PREFIX}/reorder`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: jsonBody({ kind, ids: next, },),
        },);

        await this.loadTree();
      },);
    },

    remove(kind: IvssRowKind, id: string,): Promise<void> {
      if (!confirm(`Delete ${kind} ${id}?`,)) { return Promise.resolve(); }
      return withBusy(this, async () => {
        await apiFetch(`${PREFIX}/${kind}s/${encodeURIComponent(id,)}`, {
          method: "DELETE",
        },);

        await this.loadTree();
      },);
    },
  };
}

(globalThis as unknown as Record<string, unknown>).ivssAuthoring = ivssAuthoring;
