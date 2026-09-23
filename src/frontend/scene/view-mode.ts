// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 3D View Mode Switcher (TASK-023).
 *
 * Three camera modes for the scene renderer:
 *   - orbit:        free orbit around the scene origin
 *   - first-person: camera at viewer height, WASD-style movement
 *   - cinematic:    scripted pans between preset camera frames
 *
 * Persistence:
 *   - sessionStorage under "loop-lore:view-mode"
 *   - URL ?viewMode= query parameter (deep-linkable)
 *
 * Easing: the actual transform happens via CSS transitions on the
 * scene container (`transition: transform 350ms ease-in-out`). The
 * module mirrors data-mode onto the scene container; it does NOT
 * animate in JS, so a
 * prefers-reduced-motion user gets the same end state with no
 * intermediate motion (CSS transitions are still active but easy
 * to disable via the global media-query rule).
 *
 * Scene reset: when the user navigates to a new chat / scene, the
 * scene container's `data-scene-id` attribute changes; the watcher
 * below clears the mode back to "orbit" so the new scene starts
 * with a known camera.
 */

const VALID_MODES = ["orbit", "first-person", "cinematic",] as const;
export type ViewMode = typeof VALID_MODES[number];

export interface ViewModeState {
  mode: ViewMode;
  available: ViewMode[];
  set(mode: ViewMode,): void;
  reset(): void;
  syncUrl(): void;
  restore(): void;
}

const SESSION_KEY = "loop-lore:view-mode";
const DEFAULT_MODE: ViewMode = "orbit";
export const SCENE_ID_ATTR = "data-scene-id";
/** The scene container mirrors data-mode for the CSS camera (vn.css). */
const SCENE_CONTAINER_SELECTOR = "#vn-container";
const MODE_ATTR = "data-mode";

/** Mirror the active camera mode onto the scene container. */
function syncSceneContainer(mode: ViewMode,): void {
  document
    .querySelector<HTMLElement>(SCENE_CONTAINER_SELECTOR,)
    ?.setAttribute(MODE_ATTR, mode,);
}

function isValidMode(s: string | null | undefined,): s is ViewMode {
  return s !== null && s !== undefined && (VALID_MODES as readonly string[]).includes(s,);
}

function safeStorage(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function readSession(): ViewMode | null {
  const v = safeStorage()?.getItem(SESSION_KEY,);
  return isValidMode(v,) ? v : null;
}

function writeSession(mode: ViewMode,): void {
  const s = safeStorage();
  if (!s) { return; }
  try {
    s.setItem(SESSION_KEY, mode,);
  } catch { /* quota or private mode */ }
}

function readUrl(): ViewMode | null {
  try {
    const p = new URLSearchParams(globalThis.location.search,);
    const v = p.get("viewMode",);
    return isValidMode(v,) ? v : null;
  } catch {
    return null;
  }
}

function writeUrl(mode: ViewMode,): void {
  try {
    const url = new URL(globalThis.location.href,);
    url.searchParams.set("viewMode", mode,);
    globalThis.history.replaceState(null, "", url.toString(),);
  } catch {
    /* SSR or sandboxed frame — leave the URL alone */
  }
}

let sceneWatcher: MutationObserver | null = null;

function detachSceneWatcher(): void {
  sceneWatcher?.disconnect();
  sceneWatcher = null;
}

/**
 * Watch the scene container for `data-scene-id` changes (written by
 * `syncSceneId` in alpine/chat-settings/vn.ts). Only a swap BETWEEN
 * scenes resets the camera to "orbit" — the initial attach (null →
 * id) is skipped so a restored or deep-linked camera survives the
 * first scene render. Teardown (id → null) resets, since the old
 * scene's camera position no longer applies.
 */
function attachSceneWatcher(state: ViewModeState,): void {
  if (typeof MutationObserver === "undefined") { return; }
  detachSceneWatcher();
  const target = document.querySelector<HTMLElement>(SCENE_CONTAINER_SELECTOR,);
  if (!target) { return; }
  let lastId = target.getAttribute(SCENE_ID_ATTR,);
  sceneWatcher = new MutationObserver(() => {
    const id = target.getAttribute(SCENE_ID_ATTR,);
    if (id === lastId) { return; }
    const hadScene = lastId !== null;
    lastId = id;
    if (hadScene) { state.reset(); }
  },);
  sceneWatcher.observe(target, { attributes: true, attributeFilter: [SCENE_ID_ATTR,], },);
}

export function viewMode(): ViewModeState {
  const state: ViewModeState = {
    mode: DEFAULT_MODE,
    available: [...VALID_MODES,],
    set(mode,) {
      if (!isValidMode(mode,)) { return; }
      this.mode = mode;
      writeSession(mode,);
      syncSceneContainer(mode,);
      this.syncUrl();
    },
    reset() {
      this.mode = DEFAULT_MODE;
      writeSession(DEFAULT_MODE,);
      syncSceneContainer(DEFAULT_MODE,);
      this.syncUrl();
    },
    syncUrl() {
      writeUrl(this.mode,);
    },
    restore() {
      // URL wins over sessionStorage wins over DEFAULT — the URL is
      // the most explicit user signal (e.g. a shared deep link).
      const fromUrl = readUrl();
      const fromSession = readSession();
      const next: ViewMode = fromUrl ?? fromSession ?? DEFAULT_MODE;
      this.mode = next;
      writeSession(next,);
      syncSceneContainer(next,);
      this.syncUrl();
      attachSceneWatcher(this,);
    },
  };
  return state;
}

type ViewModeFactory = typeof viewMode;
declare global {
  // eslint-disable-next-line no-var
  var viewMode: ViewModeFactory;
}

(globalThis as unknown as { viewMode: typeof viewMode }).viewMode = viewMode;
